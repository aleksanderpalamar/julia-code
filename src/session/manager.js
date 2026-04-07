"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSession = createSession;
exports.getSession = getSession;
exports.listSessions = listSessions;
exports.updateSessionTitle = updateSessionTitle;
exports.addSessionTokens = addSessionTokens;
exports.addMessage = addMessage;
exports.getMessages = getMessages;
exports.getMessageCount = getMessageCount;
exports.removeLastAssistantMessage = removeLastAssistantMessage;
exports.saveMemory = saveMemory;
exports.getMemory = getMemory;
exports.searchMemories = searchMemories;
exports.listMemories = listMemories;
exports.deleteMemory = deleteMemory;
exports.getRecentMemories = getRecentMemories;
exports.createOrchestrationRun = createOrchestrationRun;
exports.completeOrchestrationRun = completeOrchestrationRun;
exports.getOrchestrationRun = getOrchestrationRun;
exports.listOrchestrationRuns = listOrchestrationRuns;
exports.createSubagentRun = createSubagentRun;
exports.updateSubagentRunStatus = updateSubagentRunStatus;
exports.getSubagentRun = getSubagentRun;
exports.listSubagentRuns = listSubagentRuns;
exports.getLatestCompaction = getLatestCompaction;
exports.saveCompaction = saveCompaction;
var node_crypto_1 = require("node:crypto");
var db_js_1 = require("./db.js");
var index_js_1 = require("../config/index.js");
function createSession(title) {
    var db = (0, db_js_1.getDb)();
    var id = (0, node_crypto_1.randomUUID)();
    var model = (0, index_js_1.getConfig)().defaultModel;
    db.prepare('INSERT INTO sessions (id, title, model) VALUES (?, ?, ?)').run(id, title !== null && title !== void 0 ? title : 'New Session', model);
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}
function getSession(id) {
    return (0, db_js_1.getDb)().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}
function listSessions() {
    return (0, db_js_1.getDb)().prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
}
function updateSessionTitle(id, title) {
    (0, db_js_1.getDb)().prepare("UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id);
}
function addSessionTokens(id, tokens) {
    (0, db_js_1.getDb)().prepare("UPDATE sessions SET total_tokens = total_tokens + ?, updated_at = datetime('now') WHERE id = ?").run(tokens, id);
}
function addMessage(sessionId, role, content, toolCalls, toolCallId, images) {
    var db = (0, db_js_1.getDb)();
    db.prepare('INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, images) VALUES (?, ?, ?, ?, ?, ?)').run(sessionId, role, content, toolCalls ? JSON.stringify(toolCalls) : null, toolCallId !== null && toolCallId !== void 0 ? toolCallId : null, (images === null || images === void 0 ? void 0 : images.length) ? JSON.stringify(images) : null);
    db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionId);
    var lastId = db.prepare('SELECT last_insert_rowid() as id').get();
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(lastId.id);
}
function getMessages(sessionId, afterId) {
    var db = (0, db_js_1.getDb)();
    if (afterId) {
        return db.prepare('SELECT * FROM messages WHERE session_id = ? AND id > ? ORDER BY id').all(sessionId, afterId);
    }
    return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id').all(sessionId);
}
function getMessageCount(sessionId) {
    var row = (0, db_js_1.getDb)().prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?').get(sessionId);
    return row.count;
}
function removeLastAssistantMessage(sessionId) {
    var db = (0, db_js_1.getDb)();
    var last = db.prepare('SELECT id FROM messages WHERE session_id = ? AND role = ? ORDER BY id DESC LIMIT 1').get(sessionId, 'assistant');
    if (last) {
        db.prepare('DELETE FROM messages WHERE id = ?').run(last.id);
    }
}
function saveMemory(key, content, category, sourceSessionId) {
    if (category === void 0) { category = 'general'; }
    var db = (0, db_js_1.getDb)();
    db.prepare("INSERT INTO memories (key, content, category, source_session_id)\n     VALUES (?, ?, ?, ?)\n     ON CONFLICT(key) DO UPDATE SET\n       content = excluded.content,\n       category = excluded.category,\n       source_session_id = excluded.source_session_id,\n       updated_at = datetime('now')").run(key, content, category, sourceSessionId !== null && sourceSessionId !== void 0 ? sourceSessionId : null);
    return db.prepare('SELECT * FROM memories WHERE key = ?').get(key);
}
function getMemory(key) {
    return (0, db_js_1.getDb)().prepare('SELECT * FROM memories WHERE key = ?').get(key);
}
function searchMemories(query, category, limit) {
    if (limit === void 0) { limit = 20; }
    var db = (0, db_js_1.getDb)();
    var pattern = "%".concat(query, "%");
    if (category) {
        return db.prepare('SELECT * FROM memories WHERE category = ? AND (key LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT ?').all(category, pattern, pattern, limit);
    }
    return db.prepare('SELECT * FROM memories WHERE key LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT ?').all(pattern, pattern, limit);
}
function listMemories(category, limit) {
    if (limit === void 0) { limit = 20; }
    var db = (0, db_js_1.getDb)();
    if (category) {
        return db.prepare('SELECT * FROM memories WHERE category = ? ORDER BY updated_at DESC LIMIT ?').all(category, limit);
    }
    return db.prepare('SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?').all(limit);
}
function deleteMemory(key) {
    var result = (0, db_js_1.getDb)().prepare('DELETE FROM memories WHERE key = ?').run(key);
    return result.changes > 0;
}
function getRecentMemories(limit) {
    if (limit === void 0) { limit = 15; }
    return (0, db_js_1.getDb)().prepare('SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?').all(limit);
}
function createOrchestrationRun(id, parentSessionId, userTask, subtaskCount) {
    var db = (0, db_js_1.getDb)();
    db.prepare('INSERT INTO orchestration_runs (id, parent_session_id, user_task, subtask_count) VALUES (?, ?, ?, ?)').run(id, parentSessionId, userTask, subtaskCount);
    return db.prepare('SELECT * FROM orchestration_runs WHERE id = ?').get(id);
}
function completeOrchestrationRun(id, status, durationMs) {
    (0, db_js_1.getDb)().prepare("UPDATE orchestration_runs SET status = ?, completed_at = datetime('now'), duration_ms = ? WHERE id = ?").run(status, durationMs, id);
}
function getOrchestrationRun(id) {
    return (0, db_js_1.getDb)().prepare('SELECT * FROM orchestration_runs WHERE id = ?').get(id);
}
function listOrchestrationRuns(parentSessionId) {
    return (0, db_js_1.getDb)().prepare('SELECT * FROM orchestration_runs WHERE parent_session_id = ? ORDER BY created_at DESC').all(parentSessionId);
}
function createSubagentRun(id, runId, sessionId, task, model) {
    var db = (0, db_js_1.getDb)();
    db.prepare('INSERT INTO subagent_runs (id, run_id, session_id, task, model) VALUES (?, ?, ?, ?, ?)').run(id, runId, sessionId, task, model !== null && model !== void 0 ? model : null);
    return db.prepare('SELECT * FROM subagent_runs WHERE id = ?').get(id);
}
function updateSubagentRunStatus(id, status, extra) {
    var _a;
    var db = (0, db_js_1.getDb)();
    var sets = ['status = ?'];
    var params = [status];
    if (extra === null || extra === void 0 ? void 0 : extra.startedAt) {
        sets.push('started_at = ?');
        params.push(extra.startedAt);
    }
    if (extra === null || extra === void 0 ? void 0 : extra.completedAt) {
        sets.push('completed_at = ?');
        params.push(extra.completedAt);
    }
    if ((extra === null || extra === void 0 ? void 0 : extra.durationMs) !== undefined) {
        sets.push('duration_ms = ?');
        params.push(extra.durationMs);
    }
    if ((extra === null || extra === void 0 ? void 0 : extra.result) !== undefined) {
        sets.push('result = ?');
        params.push(extra.result);
    }
    if ((extra === null || extra === void 0 ? void 0 : extra.error) !== undefined) {
        sets.push('error = ?');
        params.push(extra.error);
    }
    params.push(id);
    (_a = db.prepare("UPDATE subagent_runs SET ".concat(sets.join(', '), " WHERE id = ?"))).run.apply(_a, params);
}
function getSubagentRun(id) {
    return (0, db_js_1.getDb)().prepare('SELECT * FROM subagent_runs WHERE id = ?').get(id);
}
function listSubagentRuns(runId) {
    return (0, db_js_1.getDb)().prepare('SELECT * FROM subagent_runs WHERE run_id = ? ORDER BY created_at').all(runId);
}
function getLatestCompaction(sessionId) {
    return (0, db_js_1.getDb)().prepare('SELECT * FROM compactions WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId);
}
function saveCompaction(sessionId, summary, messagesStart, messagesEnd, format) {
    if (format === void 0) { format = 'text'; }
    var db = (0, db_js_1.getDb)();
    db.prepare('INSERT INTO compactions (session_id, summary, messages_start, messages_end, format) VALUES (?, ?, ?, ?, ?)').run(sessionId, summary, messagesStart, messagesEnd, format);
    var lastId = db.prepare('SELECT last_insert_rowid() as id').get();
    return db.prepare('SELECT * FROM compactions WHERE id = ?').get(lastId.id);
}
