"use client";

import { ApiError } from "./api/client";
import { fetchMembership, signIn } from "./api/endpoints";
import { getSession, setSession, type Session } from "./session";

/**
 * Signs in with CoSpread credentials and confirms the user is an active member
 * of the business identified by `clientId`. No account is created here.
 */
export async function signInToBusiness(clientId: string, email: string, password: string): Promise<Session> {
  const id = clientId.trim();
  const auth = await signIn(email.trim(), password);

  let member;
  try {
    member = await fetchMembership(id, auth.token);
  } catch (e) {
    if (e instanceof ApiError && !e.isNetwork) {
      throw new ApiError("This account is not a member of the business with that client ID", e.status);
    }
    throw e;
  }
  if (!member.isActive) {
    throw new ApiError("Your membership of this business is suspended. Contact the business owner.", 403);
  }

  const previous = getSession();
  const sameContext = previous?.businessId === member.businessId;
  const session: Session = {
    token: auth.token,
    businessId: member.businessId,
    businessName: member.business?.name ?? "Business",
    currencyCode: member.business?.currencyCode,
    user: { firstName: auth.firstName, lastName: auth.lastName, email: auth.email },
    accessType: member.accessType,
    assignedLocationId: member.businessLocationId ?? null,
    activeLocationId:
      member.businessLocationId ??
      (sameContext ? previous?.activeLocationId : null) ??
      member.business?.primaryLocationId ??
      null,
  };
  setSession(session);
  return session;
}

/** Re-authenticates an existing session (expired token) without touching local data. */
export async function reauthenticate(password: string) {
  const session = getSession();
  if (!session) throw new Error("No session");
  const auth = await signIn(session.user.email, password);
  setSession({ ...session, token: auth.token, needsReauth: false });
}

export function signOut() {
  // Local data (carts, cached products, unsynced orders) is kept per business
  // so it's still there on the next sign-in to the same client ID.
  setSession(null);
}
