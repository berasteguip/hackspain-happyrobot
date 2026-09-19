// Pull de resultados desde la API de HappyRobot: localiza el run del workflow
// que corresponde a una sesión de chat y lee la salida del nodo Extract.
// Complementa al webhook POST /calls/outcome (que depende del túnel).

const EXTRACT_NODE_PERSISTENT = "01a0b93b-0f3e-7229-b4a0-8f8b2c28b5c7"; // "Extraer datos de la casa"
const TRIGGER_NODE_PERSISTENT = "01a0b937-7c15-75b5-a144-8d7c0a5380b0"; // trigger "Vecino (chat)"
const AGENT_NODE_PERSISTENT = "01a0b937-7c1a-78eb-9c8e-f1965e0284c6"; // "Agente Vigía"
const PLATFORM = "https://platform.eu.happyrobot.ai";

// La plataforma a veces serializa booleanos/null como cadenas.
export function normalize(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "") return null;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(normalize);
    } catch {}
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

function listFrom(res) {
  if (Array.isArray(res)) return res;
  return res?.data ?? res?.items ?? res?.runs ?? res?.nodes ?? [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Busca el run del workflow correspondiente a una sesión de chat y devuelve el
 * resultado estructurado cuando el nodo Extract haya terminado.
 * @param {HappyRobotClient} client
 * @param {string} workflowId  HR_WF_VIGIA_CHAT
 * @param {string} sessionId   session_id de la sesión A (text_session_id del trigger)
 * @param {string} personId    respaldo para casar el run si falta text_session_id
 * @param {object} opts {timeoutMs=90000, intervalMs=6000, sinceMs}
 */
export async function fetchOutcomeForSession(client, workflowId, sessionId, personId, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 90000;
  const intervalMs = opts.intervalMs ?? 6000;
  const sinceMs = opts.sinceMs ?? 0;
  const deadline = Date.now() + timeoutMs;
  let matchedRun = null;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const runs = matchedRun ? [matchedRun] : listFrom(await client.workflows.listRuns(workflowId, { page_size: 20, sort: "desc" }));
      for (const run of runs) {
        const runId = run.id ?? run.run_id;
        if (!runId) continue;
        // Casar el run por el output del trigger (text_session_id o person_id).
        if (matchedRun?.id !== runId) {
          const created = Date.parse(run.created_at ?? run.created ?? run.timestamp ?? '') || 0;
          if (sinceMs && created && created < sinceMs - 60_000) continue;
          const nodes = listFrom(await client.runs.listNodes(runId));
          const triggerNode = nodes.find((n) => (n.node_persistent_id ?? n.persistent_id) === TRIGGER_NODE_PERSISTENT);
          if (!triggerNode) continue;
          const trig = await client.runs.getOutput(runId, triggerNode.output_id ?? triggerNode.id);
          // getOutput → {data:{id, …, data:{person_id, text_session_id, …}, input:{…}}}
          const trigOut = trig?.data ?? trig;
          const trigData = trigOut?.data ?? {};
          const hit = sessionId && trigData.text_session_id
            ? trigData.text_session_id === sessionId
            : personId && trigData.person_id === personId;
          if (!hit) continue;
          matchedRun = { id: runId, nodes, runUrl: trigOut?.input?.["current.run_url"] ?? `${PLATFORM}/hackspainteam11/runs/${runId}` };
        }
        // Run casado: ¿ha terminado el nodo Extract?
        const nodes = listFrom(await client.runs.listNodes(runId));
        const extractNode = nodes.find(
          (n) => (n.node_persistent_id ?? n.persistent_id) === EXTRACT_NODE_PERSISTENT && (n.status ?? "succeeded") === "succeeded",
        );
        if (!extractNode) break; // aún corre: salimos del for y esperamos
        const extract = await client.runs.getOutput(runId, extractNode.output_id ?? extractNode.id);
        const extractData = (extract?.data ?? extract)?.data ?? {};
        const response = extractData.response ?? extractData;
        const agentNode = nodes.find((n) => (n.node_persistent_id ?? n.persistent_id) === AGENT_NODE_PERSISTENT);
        let transcript = null;
        if (agentNode) {
          try {
            const agentOut = await client.runs.getOutput(runId, agentNode.output_id ?? agentNode.id);
            transcript = ((agentOut?.data ?? agentOut)?.data ?? {})?.transcript ?? null;
          } catch { /* opcional */ }
        }
        return {
          run_id: runId,
          run_url: matchedRun.runUrl ?? `${PLATFORM}/hackspainteam11/runs/${runId}`,
          transcript,
          extracted: normalize(response),
          answered: normalize(response.answered),
        };
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(intervalMs);
  }
  return { run_id: matchedRun?.id ?? null, run_url: matchedRun ? `${PLATFORM}/hackspainteam11/runs/${matchedRun.id}` : null, transcript: null, extracted: null, answered: null, error: lastError ? String(lastError?.message ?? lastError) : "timeout" };
}
