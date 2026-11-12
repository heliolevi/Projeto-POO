// Registra os hooks de alias (scripts/alias-loader.mjs). Usado por: node --import ./scripts/registrar-alias.mjs
import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);
