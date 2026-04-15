/**
 * Module-level Socket.IO singleton.
 * Avoids Fastify decorator restrictions (can't decorate after ready()).
 */
let _io = null;

export function setIo(io) { _io = io; }
export function getIo()   { return _io; }
