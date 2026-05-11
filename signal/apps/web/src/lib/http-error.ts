/** Thrown when an API response has a non-OK HTTP status (after `authFetch` returns). */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Request failed (${status})`);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Thrown when `fetch` fails at the network layer (offline, DNS, CORS, etc.). */
export class NetworkError extends Error {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}
