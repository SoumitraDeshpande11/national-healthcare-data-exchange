import type { AuthenticatedOrg } from "../services/auth.js";

declare global {
  namespace Express {
    interface Request {
      org?: AuthenticatedOrg;
    }
  }
}
