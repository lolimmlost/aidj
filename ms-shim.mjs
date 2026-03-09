// Shim: better-auth does `import { ms } from "ms"` but the ms package only
// has a default export.  Re-export default as both default and named `ms`.
import _ms from './node_modules/ms/index.js';
export const ms = _ms;
export default _ms;
