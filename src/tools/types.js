"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolToSchema = toolToSchema;
function toolToSchema(tool) {
    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    };
}
