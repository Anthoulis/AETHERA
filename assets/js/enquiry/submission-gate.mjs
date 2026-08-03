export function createSubmissionGate() {
  let active = false;

  return Object.freeze({
    finish() {
      active = false;
    },
    isActive() {
      return active;
    },
    tryStart() {
      if (active) {
        return false;
      }

      active = true;
      return true;
    },
  });
}

export function createSubmissionId(cryptoImplementation = globalThis.crypto) {
  if (typeof cryptoImplementation?.randomUUID !== "function") {
    return null;
  }

  try {
    return cryptoImplementation.randomUUID();
  } catch {
    return null;
  }
}

export function shouldResetLogicalAttempt(status) {
  return status === 400 || status === 403;
}
