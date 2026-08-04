// AuthzError, extracted from src/lib/authz.js (EDITSv1 E3.1) so leaf
// libraries (agent-sessions.js) can throw it WITHOUT dragging in authz.js's
// @/lib/session -> next-auth import chain, which does not resolve under
// vitest's plain-node environment. authz.js re-exports this same class, so
// every existing `import { AuthzError } from "@/lib/authz"` and every
// `instanceof AuthzError` check keeps working against the one definition.
export class AuthzError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.name = "AuthzError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}
