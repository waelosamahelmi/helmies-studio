export async function apiFetch(input, init) {
  const res = await fetch(input, init);
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:required"));
    }
    throw new Error("Unauthorized");
  }
  return res;
}
