"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyModels = classifyModels;
exports.selectToolModel = selectToolModel;
exports.selectFastModel = selectFastModel;
function classifyModels(ollamaModels) {
    return ollamaModels.map(function (m) {
        var _a, _b, _c, _d, _e, _f;
        var isCloud = !!(m.remote_model && m.remote_host);
        return {
            id: m.name,
            isCloud: isCloud,
            isLocal: !isCloud,
            parameterSize: (_b = (_a = m.details) === null || _a === void 0 ? void 0 : _a.parameter_size) !== null && _b !== void 0 ? _b : '',
            parameterSizeNum: parseParameterSize((_d = (_c = m.details) === null || _c === void 0 ? void 0 : _c.parameter_size) !== null && _d !== void 0 ? _d : ''),
            quantization: (_f = (_e = m.details) === null || _e === void 0 ? void 0 : _e.quantization_level) !== null && _f !== void 0 ? _f : '',
        };
    });
}
function selectToolModel(models, currentDefault) {
    var current = models.find(function (m) { return m.id === currentDefault; });
    if (current === null || current === void 0 ? void 0 : current.isCloud)
        return null;
    var cloudModels = models
        .filter(function (m) { return m.isCloud; })
        .sort(function (a, b) { return b.parameterSizeNum - a.parameterSizeNum; });
    return cloudModels.length > 0 ? cloudModels[0].id : null;
}
function selectFastModel(models) {
    var localModels = models
        .filter(function (m) { return m.isLocal; })
        .sort(function (a, b) { return b.parameterSizeNum - a.parameterSizeNum; });
    return localModels.length > 0 ? localModels[0].id : null;
}
function parseParameterSize(size) {
    if (!size)
        return 0;
    var match = size.match(/^([\d.]+)\s*B$/i);
    if (!match)
        return 0;
    return parseFloat(match[1]);
}
