"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProvider = registerProvider;
exports.getProvider = getProvider;
exports.initProviders = initProviders;
var ollama_js_1 = require("./ollama.js");
var providers = new Map();
function registerProvider(provider) {
    providers.set(provider.name, provider);
}
function getProvider(name) {
    var p = providers.get(name);
    if (!p)
        throw new Error("Provider \"".concat(name, "\" not found"));
    return p;
}
function initProviders() {
    registerProvider(new ollama_js_1.OllamaProvider());
}
