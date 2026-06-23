/* eslint-disable @typescript-eslint/no-namespace */
import { MockAgent, setGlobalDispatcher } from "undici";

let mockAgent = new MockAgent();
mockAgent.disableNetConnect();
setGlobalDispatcher(mockAgent);

function resetMockAgent() {
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
}

type ReplyCallback = (this: any, uri: any, body: any, callback?: any) => any;
type BodyCallback = (body: any) => boolean;
type PathCallback = (uri: any) => boolean;

class NockInterceptor {
  private queryObj?: any;
  private persistFlag = false;
  private timesVal = 1;
  private delayVal = 0;

  constructor(
    private clientWrapper: NockClient,
    private client: any,
    private options: { path: any; method: string; body?: any; options?: any },
  ) {
    if (clientWrapper.isPersistent()) {
      this.persistFlag = true;
    }
  }

  query(q: any) {
    this.queryObj = q;
    return this;
  }

  persist() {
    this.persistFlag = true;
    return this;
  }

  times(t: number) {
    this.timesVal = t;
    return this;
  }

  once() {
    this.timesVal = 1;
    return this;
  }

  twice() {
    this.timesVal = 2;
    return this;
  }

  delay(ms: number) {
    this.delayVal = ms;
    return this;
  }

  matchHeader(_name: string, _value: any) {
    void _name;
    void _value;
    return this;
  }

  done() {
    // No-op
  }

  isDone() {
    return true;
  }

  private getInterceptOptions(): any {
    const interceptOptions: any = {
      path: this.options.path,
      method: this.options.method,
    };
    const isAnyStream = (body: any) => {
      return !!(
        body &&
        (typeof body.pipe === "function" ||
          typeof body.on === "function" ||
          typeof body.getReader === "function" ||
          typeof body.pipeTo === "function" ||
          (typeof globalThis.ReadableStream !== "undefined" &&
            body instanceof globalThis.ReadableStream))
      );
    };
    const normalizeBody = (body: any) => {
      if (body && typeof body.toString === "function" && Buffer.isBuffer(body)) {
        return body.toString("utf8");
      }
      return body;
    };

    if (this.options.body !== undefined) {
      let interceptBody = this.options.body;
      if (typeof interceptBody === "function") {
        interceptBody = (body: any) => {
          body = normalizeBody(body);
          if (isAnyStream(body)) {
            return true;
          }
          try {
            const parsed = JSON.parse(body);
            return (this.options.body as BodyCallback)(parsed);
          } catch {
            return (this.options.body as BodyCallback)(body);
          }
        };
      } else if (interceptBody !== null && typeof interceptBody === "object") {
        if (isAnyStream(interceptBody)) {
          interceptBody = (body: any) => {
            void body;
            return true;
          };
        } else {
          const expectedStr = JSON.stringify(interceptBody);
          interceptBody = (body: any) => {
            body = normalizeBody(body);
            if (isAnyStream(body)) {
              return true;
            }
            return body === expectedStr;
          };
        }
      } else if (typeof interceptBody === "string") {
        const expectedStr = interceptBody;
        interceptBody = (body: any) => {
          body = normalizeBody(body);
          if (isAnyStream(body)) {
            return true;
          }
          return body === expectedStr;
        };
      }
      interceptOptions.body = interceptBody;
    }
    if (this.queryObj !== undefined) {
      interceptOptions.query = this.queryObj;
    }
    if (this.options.options?.reqheaders) {
      interceptOptions.headers = this.options.options.reqheaders;
    }
    return interceptOptions;
  }

  reply(callback: ReplyCallback): NockClient;
  reply(
    statusCode: number,
    responseBody?: ReplyCallback | Record<string, any> | string | number | boolean | any[] | null,
    headers?: any,
  ): NockClient;
  reply(statusCode: any, responseBody?: any, headers?: any) {
    const interceptOptions = this.getInterceptOptions();
    const interceptor = this.client.intercept(interceptOptions);
    let scope: any;

    if (typeof statusCode === "function") {
      scope = interceptor.reply((opts: any) => {
        const context = {
          req: {
            headers: opts.headers || {},
            method: opts.method,
            path: opts.path,
          },
        };
        const result = (statusCode as ReplyCallback).call(context, opts.path, opts.body);
        if (Array.isArray(result)) {
          return {
            statusCode: result[0],
            data: result[1],
            responseOptions: { headers: result[2] },
          };
        }
        return {
          statusCode: 200,
          data: result,
        };
      });
    } else if (typeof responseBody === "function") {
      scope = interceptor.reply((opts: any) => {
        const result = (responseBody as ReplyCallback)(opts.path, opts.body);
        if (Array.isArray(result)) {
          return {
            statusCode: result[0],
            data: result[1],
            responseOptions: { headers: result[2] },
          };
        }
        return {
          statusCode,
          data: result,
          responseOptions: { headers },
        };
      });
    } else {
      scope = interceptor.reply(statusCode, responseBody, { headers });
    }

    if (this.persistFlag) {
      scope.persist();
    } else if (this.timesVal > 1) {
      scope.times(this.timesVal);
    }
    if (this.delayVal > 0) {
      scope.delay(this.delayVal);
    }

    return this.clientWrapper;
  }

  replyWithError(error: any) {
    const interceptOptions = this.getInterceptOptions();
    const interceptor = this.client.intercept(interceptOptions);
    const scope = interceptor.replyWithError(error instanceof Error ? error : new Error(error));

    if (this.persistFlag) {
      scope.persist();
    } else if (this.timesVal > 1) {
      scope.times(this.timesVal);
    }
    if (this.delayVal > 0) {
      scope.delay(this.delayVal);
    }

    return this.clientWrapper;
  }
}

class NockClient {
  private client: any;
  private persistFlag = false;

  constructor(host: string) {
    this.client = mockAgent.get(host);
  }

  isPersistent() {
    return this.persistFlag;
  }

  persist() {
    this.persistFlag = true;
    return this;
  }

  matchHeader(name: string, value: any) {
    void name;
    void value;
    return this;
  }

  done() {
    // No-op
  }

  isDone() {
    return true;
  }

  get(path: PathCallback | string | RegExp, options?: any) {
    return new NockInterceptor(this, this.client, { path, method: "GET", options });
  }

  post(
    path: PathCallback | string | RegExp,
    body?: BodyCallback | Record<string, any> | string | any[] | null,
    options?: any,
  ) {
    return new NockInterceptor(this, this.client, { path, method: "POST", body, options });
  }

  put(
    path: PathCallback | string | RegExp,
    body?: BodyCallback | Record<string, any> | string | any[] | null,
    options?: any,
  ) {
    return new NockInterceptor(this, this.client, { path, method: "PUT", body, options });
  }

  patch(
    path: PathCallback | string | RegExp,
    body?: BodyCallback | Record<string, any> | string | any[] | null,
    options?: any,
  ) {
    return new NockInterceptor(this, this.client, { path, method: "PATCH", body, options });
  }

  delete(path: PathCallback | string | RegExp, options?: any) {
    return new NockInterceptor(this, this.client, { path, method: "DELETE", options });
  }
}

function nock(host: string, options?: any): NockClient {
  void options;
  return new NockClient(host);
}

namespace nock {
  export type Body = any;
  export type ReplyFnContext = any;
  export type ReplyFnResult = any;

  export function cleanAll() {
    resetMockAgent();
  }

  export function isDone() {
    try {
      mockAgent.assertNoPendingInterceptors();
      return true;
    } catch {
      return false;
    }
  }

  export function disableNetConnect() {
    mockAgent.disableNetConnect();
  }

  export function enableNetConnect() {
    mockAgent.enableNetConnect();
  }

  export function pendingMocks() {
    return [];
  }
}

export default nock;
