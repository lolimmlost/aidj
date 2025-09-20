import { queryOptions, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createFileRoute, lazyRouteComponent, createRootRouteWithContext, Outlet, HeadContent, Scripts, redirect, RouterProvider, ScriptOnce, createRouter as createRouter$1, Link, useRouter, useMatch, rootRouteId as rootRouteId$1, ErrorComponent } from '@tanstack/react-router';
import { jsxs, jsx } from 'react/jsx-runtime';
import { useRef, useCallback, useEffect, use, createContext, useState, useMemo, Fragment } from 'react';
import { setupCoreRouterSsrQueryIntegration } from '@tanstack/router-ssr-query-core';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { reactStartCookies } from 'better-auth/react-start';
import { createEnv } from '@t3-oss/env-core';
import * as z from 'zod';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { pgTable, timestamp, text, boolean, jsonb, serial } from 'drizzle-orm/pg-core';
import invariant from 'tiny-invariant';
import warning from 'tiny-warning';
import { isPlainObject, isRedirect, isNotFound, rootRouteId, trimPathLeft, joinPaths, trimPath, processRouteTree, isResolvedRedirect, getMatchedRoutes } from '@tanstack/router-core';
import { mergeHeaders, json } from '@tanstack/router-core/ssr/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Toaster as Toaster$1 } from 'sonner';
import { SkipBack, Pause, Play, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { create } from 'zustand';
import { createHash } from 'crypto';
import { createMemoryHistory } from '@tanstack/history';
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server';
import { defineHandlerCallback, renderRouterToStream } from '@tanstack/react-router/ssr/server';

function hasProp(obj, prop) {
  try {
    return prop in obj;
  } catch {
    return false;
  }
}

var __defProp$2 = Object.defineProperty;
var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$2 = (obj, key, value) => {
  __defNormalProp$2(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class H3Error extends Error {
  constructor(message, opts = {}) {
    super(message, opts);
    __publicField$2(this, "statusCode", 500);
    __publicField$2(this, "fatal", false);
    __publicField$2(this, "unhandled", false);
    __publicField$2(this, "statusMessage");
    __publicField$2(this, "data");
    __publicField$2(this, "cause");
    if (opts.cause && !this.cause) {
      this.cause = opts.cause;
    }
  }
  toJSON() {
    const obj = {
      message: this.message,
      statusCode: sanitizeStatusCode(this.statusCode, 500)
    };
    if (this.statusMessage) {
      obj.statusMessage = sanitizeStatusMessage(this.statusMessage);
    }
    if (this.data !== void 0) {
      obj.data = this.data;
    }
    return obj;
  }
}
__publicField$2(H3Error, "__h3_error__", true);
function createError(input) {
  if (typeof input === "string") {
    return new H3Error(input);
  }
  if (isError(input)) {
    return input;
  }
  const err = new H3Error(input.message ?? input.statusMessage ?? "", {
    cause: input.cause || input
  });
  if (hasProp(input, "stack")) {
    try {
      Object.defineProperty(err, "stack", {
        get() {
          return input.stack;
        }
      });
    } catch {
      try {
        err.stack = input.stack;
      } catch {
      }
    }
  }
  if (input.data) {
    err.data = input.data;
  }
  if (input.statusCode) {
    err.statusCode = sanitizeStatusCode(input.statusCode, err.statusCode);
  } else if (input.status) {
    err.statusCode = sanitizeStatusCode(input.status, err.statusCode);
  }
  if (input.statusMessage) {
    err.statusMessage = input.statusMessage;
  } else if (input.statusText) {
    err.statusMessage = input.statusText;
  }
  if (err.statusMessage) {
    const originalMessage = err.statusMessage;
    const sanitizedMessage = sanitizeStatusMessage(err.statusMessage);
    if (sanitizedMessage !== originalMessage) {
      console.warn(
        "[h3] Please prefer using `message` for longer error messages instead of `statusMessage`. In the future, `statusMessage` will be sanitized by default."
      );
    }
  }
  if (input.fatal !== void 0) {
    err.fatal = input.fatal;
  }
  if (input.unhandled !== void 0) {
    err.unhandled = input.unhandled;
  }
  return err;
}
function isError(input) {
  return input?.constructor?.__h3_error__ === true;
}
function isMethod(event, expected, allowHead) {
  if (typeof expected === "string") {
    if (event.method === expected) {
      return true;
    }
  } else if (expected.includes(event.method)) {
    return true;
  }
  return false;
}
function assertMethod(event, expected, allowHead) {
  if (!isMethod(event, expected)) {
    throw createError({
      statusCode: 405,
      statusMessage: "HTTP method is not allowed."
    });
  }
}
function getRequestHost(event, opts = {}) {
  if (opts.xForwardedHost) {
    const xForwardedHost = event.node.req.headers["x-forwarded-host"];
    if (xForwardedHost) {
      return xForwardedHost;
    }
  }
  return event.node.req.headers.host || "localhost";
}
function getRequestProtocol(event, opts = {}) {
  if (opts.xForwardedProto !== false && event.node.req.headers["x-forwarded-proto"] === "https") {
    return "https";
  }
  return event.node.req.connection?.encrypted ? "https" : "http";
}
function getRequestURL(event, opts = {}) {
  const host = getRequestHost(event, opts);
  const protocol = getRequestProtocol(event, opts);
  const path = (event.node.req.originalUrl || event.path).replace(
    /^[/\\]+/g,
    "/"
  );
  return new URL(path, `${protocol}://${host}`);
}
function toWebRequest(event) {
  return event.web?.request || new Request(getRequestURL(event), {
    // @ts-ignore Undici option
    duplex: "half",
    method: event.method,
    headers: event.headers,
    body: getRequestWebStream(event)
  });
}

const RawBodySymbol = Symbol.for("h3RawBody");
const PayloadMethods$1 = ["PATCH", "POST", "PUT", "DELETE"];
function readRawBody(event, encoding = "utf8") {
  assertMethod(event, PayloadMethods$1);
  const _rawBody = event._requestBody || event.web?.request?.body || event.node.req[RawBodySymbol] || event.node.req.rawBody || event.node.req.body;
  if (_rawBody) {
    const promise2 = Promise.resolve(_rawBody).then((_resolved) => {
      if (Buffer.isBuffer(_resolved)) {
        return _resolved;
      }
      if (typeof _resolved.pipeTo === "function") {
        return new Promise((resolve, reject) => {
          const chunks = [];
          _resolved.pipeTo(
            new WritableStream({
              write(chunk) {
                chunks.push(chunk);
              },
              close() {
                resolve(Buffer.concat(chunks));
              },
              abort(reason) {
                reject(reason);
              }
            })
          ).catch(reject);
        });
      } else if (typeof _resolved.pipe === "function") {
        return new Promise((resolve, reject) => {
          const chunks = [];
          _resolved.on("data", (chunk) => {
            chunks.push(chunk);
          }).on("end", () => {
            resolve(Buffer.concat(chunks));
          }).on("error", reject);
        });
      }
      if (_resolved.constructor === Object) {
        return Buffer.from(JSON.stringify(_resolved));
      }
      if (_resolved instanceof URLSearchParams) {
        return Buffer.from(_resolved.toString());
      }
      return Buffer.from(_resolved);
    });
    return encoding ? promise2.then((buff) => buff.toString(encoding)) : promise2;
  }
  if (!Number.parseInt(event.node.req.headers["content-length"] || "") && !String(event.node.req.headers["transfer-encoding"] ?? "").split(",").map((e) => e.trim()).filter(Boolean).includes("chunked")) {
    return Promise.resolve(void 0);
  }
  const promise = event.node.req[RawBodySymbol] = new Promise(
    (resolve, reject) => {
      const bodyData = [];
      event.node.req.on("error", (err) => {
        reject(err);
      }).on("data", (chunk) => {
        bodyData.push(chunk);
      }).on("end", () => {
        resolve(Buffer.concat(bodyData));
      });
    }
  );
  const result = encoding ? promise.then((buff) => buff.toString(encoding)) : promise;
  return result;
}
function getRequestWebStream(event) {
  if (!PayloadMethods$1.includes(event.method)) {
    return;
  }
  const bodyStream = event.web?.request?.body || event._requestBody;
  if (bodyStream) {
    return bodyStream;
  }
  const _hasRawBody = RawBodySymbol in event.node.req || "rawBody" in event.node.req || "body" in event.node.req || "__unenv__" in event.node.req;
  if (_hasRawBody) {
    return new ReadableStream({
      async start(controller) {
        const _rawBody = await readRawBody(event, false);
        if (_rawBody) {
          controller.enqueue(_rawBody);
        }
        controller.close();
      }
    });
  }
  return new ReadableStream({
    start: (controller) => {
      event.node.req.on("data", (chunk) => {
        controller.enqueue(chunk);
      });
      event.node.req.on("end", () => {
        controller.close();
      });
      event.node.req.on("error", (err) => {
        controller.error(err);
      });
    }
  });
}

const DISALLOWED_STATUS_CHARS = /[^\u0009\u0020-\u007E]/g;
function sanitizeStatusMessage(statusMessage = "") {
  return statusMessage.replace(DISALLOWED_STATUS_CHARS, "");
}
function sanitizeStatusCode(statusCode, defaultStatusCode = 200) {
  if (!statusCode) {
    return defaultStatusCode;
  }
  if (typeof statusCode === "string") {
    statusCode = Number.parseInt(statusCode, 10);
  }
  if (statusCode < 100 || statusCode > 999) {
    return defaultStatusCode;
  }
  return statusCode;
}
function splitCookiesString(cookiesString) {
  if (Array.isArray(cookiesString)) {
    return cookiesString.flatMap((c) => splitCookiesString(c));
  }
  if (typeof cookiesString !== "string") {
    return [];
  }
  const cookiesStrings = [];
  let pos = 0;
  let start;
  let ch;
  let lastComma;
  let nextStart;
  let cookiesSeparatorFound;
  const skipWhitespace = () => {
    while (pos < cookiesString.length && /\s/.test(cookiesString.charAt(pos))) {
      pos += 1;
    }
    return pos < cookiesString.length;
  };
  const notSpecialChar = () => {
    ch = cookiesString.charAt(pos);
    return ch !== "=" && ch !== ";" && ch !== ",";
  };
  while (pos < cookiesString.length) {
    start = pos;
    cookiesSeparatorFound = false;
    while (skipWhitespace()) {
      ch = cookiesString.charAt(pos);
      if (ch === ",") {
        lastComma = pos;
        pos += 1;
        skipWhitespace();
        nextStart = pos;
        while (pos < cookiesString.length && notSpecialChar()) {
          pos += 1;
        }
        if (pos < cookiesString.length && cookiesString.charAt(pos) === "=") {
          cookiesSeparatorFound = true;
          pos = nextStart;
          cookiesStrings.push(cookiesString.slice(start, lastComma));
          start = pos;
        } else {
          pos = lastComma + 1;
        }
      } else {
        pos += 1;
      }
    }
    if (!cookiesSeparatorFound || pos >= cookiesString.length) {
      cookiesStrings.push(cookiesString.slice(start));
    }
  }
  return cookiesStrings;
}

typeof setImmediate === "undefined" ? (fn) => fn() : setImmediate;
function getResponseStatus$1(event) {
  return event.node.res.statusCode;
}
function getResponseHeaders$1(event) {
  return event.node.res.getHeaders();
}
function sendStream(event, stream) {
  if (!stream || typeof stream !== "object") {
    throw new Error("[h3] Invalid stream provided.");
  }
  event.node.res._data = stream;
  if (!event.node.res.socket) {
    event._handled = true;
    return Promise.resolve();
  }
  if (hasProp(stream, "pipeTo") && typeof stream.pipeTo === "function") {
    return stream.pipeTo(
      new WritableStream({
        write(chunk) {
          event.node.res.write(chunk);
        }
      })
    ).then(() => {
      event.node.res.end();
    });
  }
  if (hasProp(stream, "pipe") && typeof stream.pipe === "function") {
    return new Promise((resolve, reject) => {
      stream.pipe(event.node.res);
      if (stream.on) {
        stream.on("end", () => {
          event.node.res.end();
          resolve();
        });
        stream.on("error", (error) => {
          reject(error);
        });
      }
      event.node.res.on("close", () => {
        if (stream.abort) {
          stream.abort();
        }
      });
    });
  }
  throw new Error("[h3] Invalid or incompatible stream provided.");
}
function sendWebResponse(event, response) {
  for (const [key, value] of response.headers) {
    if (key === "set-cookie") {
      event.node.res.appendHeader(key, splitCookiesString(value));
    } else {
      event.node.res.setHeader(key, value);
    }
  }
  if (response.status) {
    event.node.res.statusCode = sanitizeStatusCode(
      response.status,
      event.node.res.statusCode
    );
  }
  if (response.statusText) {
    event.node.res.statusMessage = sanitizeStatusMessage(response.statusText);
  }
  if (response.redirected) {
    event.node.res.setHeader("location", response.url);
  }
  if (!response.body) {
    event.node.res.end();
    return;
  }
  return sendStream(event, response.body);
}

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class H3Event {
  constructor(req, res) {
    __publicField(this, "__is_event__", true);
    // Context
    __publicField(this, "node");
    // Node
    __publicField(this, "web");
    // Web
    __publicField(this, "context", {});
    // Shared
    // Request
    __publicField(this, "_method");
    __publicField(this, "_path");
    __publicField(this, "_headers");
    __publicField(this, "_requestBody");
    // Response
    __publicField(this, "_handled", false);
    // Hooks
    __publicField(this, "_onBeforeResponseCalled");
    __publicField(this, "_onAfterResponseCalled");
    this.node = { req, res };
  }
  // --- Request ---
  get method() {
    if (!this._method) {
      this._method = (this.node.req.method || "GET").toUpperCase();
    }
    return this._method;
  }
  get path() {
    return this._path || this.node.req.url || "/";
  }
  get headers() {
    if (!this._headers) {
      this._headers = _normalizeNodeHeaders(this.node.req.headers);
    }
    return this._headers;
  }
  // --- Respoonse ---
  get handled() {
    return this._handled || this.node.res.writableEnded || this.node.res.headersSent;
  }
  respondWith(response) {
    return Promise.resolve(response).then(
      (_response) => sendWebResponse(this, _response)
    );
  }
  // --- Utils ---
  toString() {
    return `[${this.method}] ${this.path}`;
  }
  toJSON() {
    return this.toString();
  }
  // --- Deprecated ---
  /** @deprecated Please use `event.node.req` instead. */
  get req() {
    return this.node.req;
  }
  /** @deprecated Please use `event.node.res` instead. */
  get res() {
    return this.node.res;
  }
}
function _normalizeNodeHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

function defineEventHandler$1(handler) {
  if (typeof handler === "function") {
    handler.__is_handler__ = true;
    return handler;
  }
  const _hooks = {
    onRequest: _normalizeArray(handler.onRequest),
    onBeforeResponse: _normalizeArray(handler.onBeforeResponse)
  };
  const _handler = (event) => {
    return _callHandler(event, handler.handler, _hooks);
  };
  _handler.__is_handler__ = true;
  _handler.__resolve__ = handler.handler.__resolve__;
  _handler.__websocket__ = handler.websocket;
  return _handler;
}
function _normalizeArray(input) {
  return input ? Array.isArray(input) ? input : [input] : void 0;
}
async function _callHandler(event, handler, hooks) {
  if (hooks.onRequest) {
    for (const hook of hooks.onRequest) {
      await hook(event);
      if (event.handled) {
        return;
      }
    }
  }
  const body = await handler(event);
  const response = { body };
  if (hooks.onBeforeResponse) {
    for (const hook of hooks.onBeforeResponse) {
      await hook(event, response);
    }
  }
  return response.body;
}

function StartServer(props) {
  return /* @__PURE__ */ jsx(RouterProvider, { router: props.router });
}
const defaultStreamHandler = defineHandlerCallback(
  ({ request, router, responseHeaders }) => renderRouterToStream({
    request,
    router,
    responseHeaders,
    children: /* @__PURE__ */ jsx(StartServer, { router })
  })
);
const startSerializer = {
  stringify: (value) => JSON.stringify(value, function replacer(key, val) {
    const ogVal = this[key];
    const serializer = serializers.find((t) => t.stringifyCondition(ogVal));
    if (serializer) {
      return serializer.stringify(ogVal);
    }
    return val;
  }),
  parse: (value) => JSON.parse(value, function parser(key, val) {
    const ogVal = this[key];
    if (isPlainObject(ogVal)) {
      const serializer = serializers.find((t) => t.parseCondition(ogVal));
      if (serializer) {
        return serializer.parse(ogVal);
      }
    }
    return val;
  }),
  encode: (value) => {
    if (Array.isArray(value)) {
      return value.map((v) => startSerializer.encode(v));
    }
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          startSerializer.encode(v)
        ])
      );
    }
    const serializer = serializers.find((t) => t.stringifyCondition(value));
    if (serializer) {
      return serializer.stringify(value);
    }
    return value;
  },
  decode: (value) => {
    if (isPlainObject(value)) {
      const serializer = serializers.find((t) => t.parseCondition(value));
      if (serializer) {
        return serializer.parse(value);
      }
    }
    if (Array.isArray(value)) {
      return value.map((v) => startSerializer.decode(v));
    }
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          startSerializer.decode(v)
        ])
      );
    }
    return value;
  }
};
const createSerializer = (key, check, toValue, fromValue) => ({
  key,
  stringifyCondition: check,
  stringify: (value) => ({ [`$${key}`]: toValue(value) }),
  parseCondition: (value) => Object.hasOwn(value, `$${key}`),
  parse: (value) => fromValue(value[`$${key}`])
});
const serializers = [
  createSerializer(
    // Key
    "undefined",
    // Check
    (v) => v === void 0,
    // To
    () => 0,
    // From
    () => void 0
  ),
  createSerializer(
    // Key
    "date",
    // Check
    (v) => v instanceof Date,
    // To
    (v) => v.toISOString(),
    // From
    (v) => new Date(v)
  ),
  createSerializer(
    // Key
    "error",
    // Check
    (v) => v instanceof Error,
    // To
    (v) => ({
      ...v,
      message: v.message,
      stack: void 0,
      cause: v.cause
    }),
    // From
    (v) => Object.assign(new Error(v.message), v)
  ),
  createSerializer(
    // Key
    "formData",
    // Check
    (v) => v instanceof FormData,
    // To
    (v) => {
      const entries = {};
      v.forEach((value, key) => {
        const entry = entries[key];
        if (entry !== void 0) {
          if (Array.isArray(entry)) {
            entry.push(value);
          } else {
            entries[key] = [entry, value];
          }
        } else {
          entries[key] = value;
        }
      });
      return entries;
    },
    // From
    (v) => {
      const formData = new FormData();
      Object.entries(v).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((val) => formData.append(key, val));
        } else {
          formData.append(key, value);
        }
      });
      return formData;
    }
  ),
  createSerializer(
    // Key
    "bigint",
    // Check
    (v) => typeof v === "bigint",
    // To
    (v) => v.toString(),
    // From
    (v) => BigInt(v)
  ),
  createSerializer(
    // Key
    "server-function",
    // Check
    (v) => typeof v === "function" && "functionId" in v && typeof v.functionId === "string",
    // To
    ({ functionId }) => ({ functionId, __serverFn: true }),
    // From, dummy impl. the actual server function lookup is done on the server in packages/start-server-core/src/server-functions-handler.ts
    (v) => v
  )
];
const startStorage = new AsyncLocalStorage();
async function runWithStartContext(context, fn) {
  return startStorage.run(context, fn);
}
function getStartContext(opts) {
  const context = startStorage.getStore();
  if (!context && (opts == null ? void 0 : opts.throwIfNotFound) !== false) {
    throw new Error(
      `No Start context found in AsyncLocalStorage. Make sure you are using the function within the server runtime.`
    );
  }
  return context;
}
const globalMiddleware = [];
const getRouterInstance = () => {
  var _a;
  return (_a = getStartContext({
    throwIfNotFound: false
  })) == null ? void 0 : _a.router;
};
function createServerFn(options, __opts) {
  const resolvedOptions = __opts || options || {};
  if (typeof resolvedOptions.method === "undefined") {
    resolvedOptions.method = "GET";
  }
  return {
    options: resolvedOptions,
    middleware: (middleware) => {
      return createServerFn(void 0, Object.assign(resolvedOptions, {
        middleware
      }));
    },
    validator: (validator) => {
      return createServerFn(void 0, Object.assign(resolvedOptions, {
        validator
      }));
    },
    type: (type) => {
      return createServerFn(void 0, Object.assign(resolvedOptions, {
        type
      }));
    },
    handler: (...args) => {
      const [extractedFn, serverFn] = args;
      Object.assign(resolvedOptions, {
        ...extractedFn,
        extractedFn,
        serverFn
      });
      const resolvedMiddleware = [...resolvedOptions.middleware || [], serverFnBaseToMiddleware(resolvedOptions)];
      return Object.assign(async (opts) => {
        return executeMiddleware$1(resolvedMiddleware, "client", {
          ...extractedFn,
          ...resolvedOptions,
          data: opts == null ? void 0 : opts.data,
          headers: opts == null ? void 0 : opts.headers,
          signal: opts == null ? void 0 : opts.signal,
          context: {},
          router: getRouterInstance()
        }).then((d) => {
          if (resolvedOptions.response === "full") {
            return d;
          }
          if (d.error) throw d.error;
          return d.result;
        });
      }, {
        // This copies over the URL, function ID
        ...extractedFn,
        // The extracted function on the server-side calls
        // this function
        __executeServer: async (opts_, signal) => {
          const opts = opts_ instanceof FormData ? extractFormDataContext(opts_) : opts_;
          opts.type = typeof resolvedOptions.type === "function" ? resolvedOptions.type(opts) : resolvedOptions.type;
          const ctx = {
            ...extractedFn,
            ...opts,
            signal
          };
          const run = () => executeMiddleware$1(resolvedMiddleware, "server", ctx).then((d) => ({
            // Only send the result and sendContext back to the client
            result: d.result,
            error: d.error,
            context: d.sendContext
          }));
          if (ctx.type === "static") {
            let response;
            if (serverFnStaticCache == null ? void 0 : serverFnStaticCache.getItem) {
              response = await serverFnStaticCache.getItem(ctx);
            }
            if (!response) {
              response = await run().then((d) => {
                return {
                  ctx: d,
                  error: null
                };
              }).catch((e) => {
                return {
                  ctx: void 0,
                  error: e
                };
              });
              if (serverFnStaticCache == null ? void 0 : serverFnStaticCache.setItem) {
                await serverFnStaticCache.setItem(ctx, response);
              }
            }
            invariant(response, "No response from both server and static cache!");
            if (response.error) {
              throw response.error;
            }
            return response.ctx;
          }
          return run();
        }
      });
    }
  };
}
async function executeMiddleware$1(middlewares, env2, opts) {
  const flattenedMiddlewares = flattenMiddlewares([...globalMiddleware, ...middlewares]);
  const next = async (ctx) => {
    const nextMiddleware = flattenedMiddlewares.shift();
    if (!nextMiddleware) {
      return ctx;
    }
    if (nextMiddleware.options.validator && (env2 === "client" ? nextMiddleware.options.validateClient : true)) {
      ctx.data = await execValidator(nextMiddleware.options.validator, ctx.data);
    }
    const middlewareFn = env2 === "client" ? nextMiddleware.options.client : nextMiddleware.options.server;
    if (middlewareFn) {
      return applyMiddleware(middlewareFn, ctx, async (newCtx) => {
        return next(newCtx).catch((error) => {
          if (isRedirect(error) || isNotFound(error)) {
            return {
              ...newCtx,
              error
            };
          }
          throw error;
        });
      });
    }
    return next(ctx);
  };
  return next({
    ...opts,
    headers: opts.headers || {},
    sendContext: opts.sendContext || {},
    context: opts.context || {}
  });
}
let serverFnStaticCache;
function setServerFnStaticCache(cache) {
  const previousCache = serverFnStaticCache;
  serverFnStaticCache = typeof cache === "function" ? cache() : cache;
  return () => {
    serverFnStaticCache = previousCache;
  };
}
function createServerFnStaticCache(serverFnStaticCache2) {
  return serverFnStaticCache2;
}
async function sha1Hash(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
setServerFnStaticCache(() => {
  const getStaticCacheUrl = async (options, hash) => {
    const filename = await sha1Hash(`${options.functionId}__${hash}`);
    return `/__tsr/staticServerFnCache/${filename}.json`;
  };
  const jsonToFilenameSafeString = (json2) => {
    const sortedKeysReplacer = (key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort().reduce((acc, curr) => {
      acc[curr] = value[curr];
      return acc;
    }, {}) : value;
    const jsonString = JSON.stringify(json2 ?? "", sortedKeysReplacer);
    return jsonString.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_");
  };
  const staticClientCache = typeof document !== "undefined" ? /* @__PURE__ */ new Map() : null;
  return createServerFnStaticCache({
    getItem: async (ctx) => {
      if (typeof document === "undefined") {
        const hash = jsonToFilenameSafeString(ctx.data);
        const url = await getStaticCacheUrl(ctx, hash);
        const publicUrl = "/home/dankhost3/dev/aidj/.output/public";
        const {
          promises: fs
        } = await import('node:fs');
        const path = await import('node:path');
        const filePath = path.join(publicUrl, url);
        const [cachedResult, readError] = await fs.readFile(filePath, "utf-8").then((c) => [startSerializer.parse(c), null]).catch((e) => [null, e]);
        if (readError && readError.code !== "ENOENT") {
          throw readError;
        }
        return cachedResult;
      }
      return void 0;
    },
    setItem: async (ctx, response) => {
      const {
        promises: fs
      } = await import('node:fs');
      const path = await import('node:path');
      const hash = jsonToFilenameSafeString(ctx.data);
      const url = await getStaticCacheUrl(ctx, hash);
      const publicUrl = "/home/dankhost3/dev/aidj/.output/public";
      const filePath = path.join(publicUrl, url);
      await fs.mkdir(path.dirname(filePath), {
        recursive: true
      });
      await fs.writeFile(filePath, startSerializer.stringify(response));
    },
    fetchItem: async (ctx) => {
      const hash = jsonToFilenameSafeString(ctx.data);
      const url = await getStaticCacheUrl(ctx, hash);
      let result = staticClientCache == null ? void 0 : staticClientCache.get(url);
      if (!result) {
        result = await fetch(url, {
          method: "GET"
        }).then((r) => r.text()).then((d) => startSerializer.parse(d));
        staticClientCache == null ? void 0 : staticClientCache.set(url, result);
      }
      return result;
    }
  });
});
function extractFormDataContext(formData) {
  const serializedContext = formData.get("__TSR_CONTEXT");
  formData.delete("__TSR_CONTEXT");
  if (typeof serializedContext !== "string") {
    return {
      context: {},
      data: formData
    };
  }
  try {
    const context = startSerializer.parse(serializedContext);
    return {
      context,
      data: formData
    };
  } catch {
    return {
      data: formData
    };
  }
}
function flattenMiddlewares(middlewares) {
  const seen = /* @__PURE__ */ new Set();
  const flattened = [];
  const recurse = (middleware) => {
    middleware.forEach((m) => {
      if (m.options.middleware) {
        recurse(m.options.middleware);
      }
      if (!seen.has(m)) {
        seen.add(m);
        flattened.push(m);
      }
    });
  };
  recurse(middlewares);
  return flattened;
}
const applyMiddleware = async (middlewareFn, ctx, nextFn) => {
  return middlewareFn({
    ...ctx,
    next: async (userCtx = {}) => {
      return nextFn({
        ...ctx,
        ...userCtx,
        context: {
          ...ctx.context,
          ...userCtx.context
        },
        sendContext: {
          ...ctx.sendContext,
          ...userCtx.sendContext ?? {}
        },
        headers: mergeHeaders(ctx.headers, userCtx.headers),
        result: userCtx.result !== void 0 ? userCtx.result : ctx.response === "raw" ? userCtx : ctx.result,
        error: userCtx.error ?? ctx.error
      });
    }
  });
};
function execValidator(validator, input) {
  if (validator == null) return {};
  if ("~standard" in validator) {
    const result = validator["~standard"].validate(input);
    if (result instanceof Promise) throw new Error("Async validation not supported");
    if (result.issues) throw new Error(JSON.stringify(result.issues, void 0, 2));
    return result.value;
  }
  if ("parse" in validator) {
    return validator.parse(input);
  }
  if (typeof validator === "function") {
    return validator(input);
  }
  throw new Error("Invalid validator type!");
}
function serverFnBaseToMiddleware(options) {
  return {
    _types: void 0,
    options: {
      validator: options.validator,
      validateClient: options.validateClient,
      client: async ({
        next,
        sendContext,
        ...ctx
      }) => {
        var _a;
        const payload = {
          ...ctx,
          // switch the sendContext over to context
          context: sendContext,
          type: typeof ctx.type === "function" ? ctx.type(ctx) : ctx.type
        };
        if (ctx.type === "static" && "production" === "production" && typeof document !== "undefined") {
          invariant(serverFnStaticCache, "serverFnStaticCache.fetchItem is not available!");
          const result = await serverFnStaticCache.fetchItem(payload);
          if (result) {
            if (result.error) {
              throw result.error;
            }
            return next(result.ctx);
          }
          warning(result, `No static cache item found for ${payload.functionId}__${JSON.stringify(payload.data)}, falling back to server function...`);
        }
        const res = await ((_a = options.extractedFn) == null ? void 0 : _a.call(options, payload));
        return next(res);
      },
      server: async ({
        next,
        ...ctx
      }) => {
        var _a;
        const result = await ((_a = options.serverFn) == null ? void 0 : _a.call(options, ctx));
        return next({
          ...ctx,
          result
        });
      }
    }
  };
}
const eventStorage = new AsyncLocalStorage();
function defineEventHandler(handler) {
  return defineEventHandler$1((event) => {
    return runWithEvent(event, () => handler(event));
  });
}
async function runWithEvent(event, fn) {
  return eventStorage.run(event, fn);
}
function getEvent() {
  const event = eventStorage.getStore();
  if (!event) {
    throw new Error(
      `No HTTPEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.`
    );
  }
  return event;
}
const HTTPEventSymbol = Symbol("$HTTPEvent");
function isEvent(obj) {
  return typeof obj === "object" && (obj instanceof H3Event || (obj == null ? void 0 : obj[HTTPEventSymbol]) instanceof H3Event || (obj == null ? void 0 : obj.__is_event__) === true);
}
function createWrapperFunction(h3Function) {
  return function(...args) {
    const event = args[0];
    if (!isEvent(event)) {
      args.unshift(getEvent());
    } else {
      args[0] = event instanceof H3Event || event.__is_event__ ? event : event[HTTPEventSymbol];
    }
    return h3Function(...args);
  };
}
const getResponseStatus = createWrapperFunction(getResponseStatus$1);
const getResponseHeaders = createWrapperFunction(getResponseHeaders$1);
const getWebRequest = createWrapperFunction(toWebRequest);
function requestHandler(handler) {
  return handler;
}
const VIRTUAL_MODULES = {
  routeTree: "tanstack-start-route-tree:v",
  startManifest: "tanstack-start-manifest:v",
  serverFnManifest: "tanstack-start-server-fn-manifest:v"
};
async function loadVirtualModule(id) {
  switch (id) {
    case VIRTUAL_MODULES.routeTree:
      return await Promise.resolve().then(() => routeTree_gen);
    case VIRTUAL_MODULES.startManifest:
      return await import('./_tanstack-start-manifest_v-xTwn_PaP.mjs');
    case VIRTUAL_MODULES.serverFnManifest:
      return await import('./_tanstack-start-server-fn-manifest_v-CpFaMn_U.mjs');
    default:
      throw new Error(`Unknown virtual module: ${id}`);
  }
}
async function getStartManifest(opts) {
  const { tsrStartManifest } = await loadVirtualModule(
    VIRTUAL_MODULES.startManifest
  );
  const startManifest = tsrStartManifest();
  const rootRoute = startManifest.routes[rootRouteId] = startManifest.routes[rootRouteId] || {};
  rootRoute.assets = rootRoute.assets || [];
  let script = `import('${startManifest.clientEntry}')`;
  rootRoute.assets.push({
    tag: "script",
    attrs: {
      type: "module",
      suppressHydrationWarning: true,
      async: true
    },
    children: script
  });
  const manifest = {
    ...startManifest,
    routes: Object.fromEntries(
      Object.entries(startManifest.routes).map(([k, v]) => {
        const { preloads, assets } = v;
        return [
          k,
          {
            preloads,
            assets
          }
        ];
      })
    )
  };
  return manifest;
}
function sanitizeBase$1(base) {
  return base.replace(/^\/|\/$/g, "");
}
async function revive(root, reviver) {
  async function reviveNode(holder2, key) {
    const value = holder2[key];
    if (value && typeof value === "object") {
      await Promise.all(Object.keys(value).map((k) => reviveNode(value, k)));
    }
    if (reviver) {
      holder2[key] = await reviver(key, holder2[key]);
    }
  }
  const holder = {
    "": root
  };
  await reviveNode(holder, "");
  return holder[""];
}
async function reviveServerFns(key, value) {
  if (value && value.__serverFn === true && value.functionId) {
    const serverFn = await getServerFnById(value.functionId);
    return async (opts, signal) => {
      const result = await serverFn(opts ?? {}, signal);
      return result.result;
    };
  }
  return value;
}
async function getServerFnById(serverFnId) {
  const {
    default: serverFnManifest
  } = await loadVirtualModule(VIRTUAL_MODULES.serverFnManifest);
  const serverFnInfo = serverFnManifest[serverFnId];
  if (!serverFnInfo) {
    console.info("serverFnManifest", serverFnManifest);
    throw new Error("Server function info not found for " + serverFnId);
  }
  const fnModule = await serverFnInfo.importer();
  if (!fnModule) {
    console.info("serverFnInfo", serverFnInfo);
    throw new Error("Server function module not resolved for " + serverFnId);
  }
  const action = fnModule[serverFnInfo.functionName];
  if (!action) {
    console.info("serverFnInfo", serverFnInfo);
    console.info("fnModule", fnModule);
    throw new Error(`Server function module export not resolved for serverFn ID: ${serverFnId}`);
  }
  return action;
}
async function parsePayload(payload) {
  const parsedPayload = startSerializer.parse(payload);
  await revive(parsedPayload, reviveServerFns);
  return parsedPayload;
}
const handleServerAction = async ({
  request
}) => {
  const controller = new AbortController();
  const signal = controller.signal;
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort);
  const method = request.method;
  const url = new URL(request.url, "http://localhost:3000");
  const regex = new RegExp(`${sanitizeBase$1("/_serverFn")}/([^/?#]+)`);
  const match = url.pathname.match(regex);
  const serverFnId = match ? match[1] : null;
  const search2 = Object.fromEntries(url.searchParams.entries());
  const isCreateServerFn = "createServerFn" in search2;
  const isRaw = "raw" in search2;
  if (typeof serverFnId !== "string") {
    throw new Error("Invalid server action param for serverFnId: " + serverFnId);
  }
  const action = await getServerFnById(serverFnId);
  const formDataContentTypes = ["multipart/form-data", "application/x-www-form-urlencoded"];
  const response = await (async () => {
    try {
      let result = await (async () => {
        if (request.headers.get("Content-Type") && formDataContentTypes.some((type) => {
          var _a;
          return (_a = request.headers.get("Content-Type")) == null ? void 0 : _a.includes(type);
        })) {
          invariant(method.toLowerCase() !== "get", "GET requests with FormData payloads are not supported");
          return await action(await request.formData(), signal);
        }
        if (method.toLowerCase() === "get") {
          let payload2 = search2;
          if (isCreateServerFn) {
            payload2 = search2.payload;
          }
          payload2 = payload2 ? await parsePayload(payload2) : payload2;
          return await action(payload2, signal);
        }
        const jsonPayloadAsString = await request.text();
        const payload = await parsePayload(jsonPayloadAsString);
        if (isCreateServerFn) {
          return await action(payload, signal);
        }
        return await action(...payload, signal);
      })();
      if (result.result instanceof Response) {
        return result.result;
      }
      if (!isCreateServerFn) {
        result = result.result;
        if (result instanceof Response) {
          return result;
        }
      }
      if (isNotFound(result)) {
        return isNotFoundResponse(result);
      }
      return new Response(result !== void 0 ? startSerializer.stringify(result) : void 0, {
        status: getResponseStatus(getEvent()),
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }
      if (isNotFound(error)) {
        return isNotFoundResponse(error);
      }
      console.info();
      console.info("Server Fn Error!");
      console.info();
      console.error(error);
      console.info();
      return new Response(startSerializer.stringify(error), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  })();
  request.signal.removeEventListener("abort", abort);
  if (isRaw) {
    return response;
  }
  return response;
};
function isNotFoundResponse(error) {
  const {
    headers,
    ...rest
  } = error;
  return new Response(JSON.stringify(rest), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...headers || {}
    }
  });
}
const HEADERS = {
  TSS_SHELL: "X-TSS_SHELL"
};
function getStartResponseHeaders(opts) {
  const headers = mergeHeaders(
    getResponseHeaders(),
    {
      "Content-Type": "text/html; charset=UTF-8"
    },
    ...opts.router.state.matches.map((match) => {
      return match.headers;
    })
  );
  return headers;
}
function createStartHandler({
  createRouter: createRouter2
}) {
  let routeTreeModule = null;
  let startRoutesManifest = null;
  let processedServerRouteTree = void 0;
  return (cb) => {
    const originalFetch = globalThis.fetch;
    const startRequestResolver = async ({ request }) => {
      globalThis.fetch = async function(input, init) {
        function resolve(url2, requestOptions) {
          const fetchRequest = new Request(url2, requestOptions);
          return startRequestResolver({ request: fetchRequest });
        }
        function getOrigin() {
          return request.headers.get("Origin") || request.headers.get("Referer") || "http://localhost";
        }
        if (typeof input === "string" && input.startsWith("/")) {
          const url2 = new URL(input, getOrigin());
          return resolve(url2, init);
        } else if (typeof input === "object" && "url" in input && typeof input.url === "string" && input.url.startsWith("/")) {
          const url2 = new URL(input.url, getOrigin());
          return resolve(url2, init);
        }
        return originalFetch(input, init);
      };
      const url = new URL(request.url);
      const href = url.href.replace(url.origin, "");
      const APP_BASE = "/";
      const router = await createRouter2();
      const history = createMemoryHistory({
        initialEntries: [href]
      });
      const isPrerendering = process.env.TSS_PRERENDERING === "true";
      let isShell = process.env.TSS_SHELL === "true";
      if (isPrerendering && !isShell) {
        isShell = request.headers.get(HEADERS.TSS_SHELL) === "true";
      }
      router.update({
        history,
        isShell,
        isPrerendering
      });
      const response = await (async () => {
        try {
          if (false) ;
          const serverFnBase = joinPaths([
            APP_BASE,
            trimPath("/_serverFn"),
            "/"
          ]);
          if (href.startsWith(serverFnBase)) {
            return await handleServerAction({ request });
          }
          if (routeTreeModule === null) {
            try {
              routeTreeModule = await loadVirtualModule(
                VIRTUAL_MODULES.routeTree
              );
              if (routeTreeModule.serverRouteTree) {
                processedServerRouteTree = processRouteTree({
                  routeTree: routeTreeModule.serverRouteTree,
                  initRoute: (route, i) => {
                    route.init({
                      originalIndex: i
                    });
                  }
                });
              }
            } catch (e) {
              console.log(e);
            }
          }
          const executeRouter = () => runWithStartContext({ router }, async () => {
            const requestAcceptHeader = request.headers.get("Accept") || "*/*";
            const splitRequestAcceptHeader = requestAcceptHeader.split(",");
            const supportedMimeTypes = ["*/*", "text/html"];
            const isRouterAcceptSupported = supportedMimeTypes.some(
              (mimeType) => splitRequestAcceptHeader.some(
                (acceptedMimeType) => acceptedMimeType.trim().startsWith(mimeType)
              )
            );
            if (!isRouterAcceptSupported) {
              return json(
                {
                  error: "Only HTML requests are supported here"
                },
                {
                  status: 500
                }
              );
            }
            if (startRoutesManifest === null) {
              startRoutesManifest = await getStartManifest({
                basePath: APP_BASE
              });
            }
            attachRouterServerSsrUtils(router, startRoutesManifest);
            await router.load();
            if (router.state.redirect) {
              return router.state.redirect;
            }
            await router.serverSsr.dehydrate();
            const responseHeaders = getStartResponseHeaders({ router });
            const response2 = await cb({
              request,
              router,
              responseHeaders
            });
            return response2;
          });
          if (processedServerRouteTree) {
            const [_matchedRoutes, response2] = await handleServerRoutes({
              processedServerRouteTree,
              router,
              request,
              basePath: APP_BASE,
              executeRouter
            });
            if (response2) return response2;
          }
          const routerResponse = await executeRouter();
          return routerResponse;
        } catch (err) {
          if (err instanceof Response) {
            return err;
          }
          throw err;
        }
      })();
      if (isRedirect(response)) {
        if (isResolvedRedirect(response)) {
          if (request.headers.get("x-tsr-redirect") === "manual") {
            return json(
              {
                ...response.options,
                isSerializedRedirect: true
              },
              {
                headers: response.headers
              }
            );
          }
          return response;
        }
        if (response.options.to && typeof response.options.to === "string" && !response.options.to.startsWith("/")) {
          throw new Error(
            `Server side redirects must use absolute paths via the 'href' or 'to' options. The redirect() method's "to" property accepts an internal path only. Use the "href" property to provide an external URL. Received: ${JSON.stringify(response.options)}`
          );
        }
        if (["params", "search", "hash"].some(
          (d) => typeof response.options[d] === "function"
        )) {
          throw new Error(
            `Server side redirects must use static search, params, and hash values and do not support functional values. Received functional values for: ${Object.keys(
              response.options
            ).filter((d) => typeof response.options[d] === "function").map((d) => `"${d}"`).join(", ")}`
          );
        }
        const redirect2 = router.resolveRedirect(response);
        if (request.headers.get("x-tsr-redirect") === "manual") {
          return json(
            {
              ...response.options,
              isSerializedRedirect: true
            },
            {
              headers: response.headers
            }
          );
        }
        return redirect2;
      }
      return response;
    };
    return requestHandler(startRequestResolver);
  };
}
async function handleServerRoutes(opts) {
  var _a, _b;
  const url = new URL(opts.request.url);
  const pathname = url.pathname;
  const serverTreeResult = getMatchedRoutes({
    pathname,
    basepath: opts.basePath,
    caseSensitive: true,
    routesByPath: opts.processedServerRouteTree.routesByPath,
    routesById: opts.processedServerRouteTree.routesById,
    flatRoutes: opts.processedServerRouteTree.flatRoutes
  });
  const routeTreeResult = opts.router.getMatchedRoutes(pathname, void 0);
  let response;
  let matchedRoutes = [];
  matchedRoutes = serverTreeResult.matchedRoutes;
  if (routeTreeResult.foundRoute) {
    if (serverTreeResult.matchedRoutes.length < routeTreeResult.matchedRoutes.length) {
      const closestCommon = [...routeTreeResult.matchedRoutes].reverse().find((r) => {
        return opts.processedServerRouteTree.routesById[r.id] !== void 0;
      });
      if (closestCommon) {
        let routeId = closestCommon.id;
        matchedRoutes = [];
        do {
          const route = opts.processedServerRouteTree.routesById[routeId];
          if (!route) {
            break;
          }
          matchedRoutes.push(route);
          routeId = (_a = route.parentRoute) == null ? void 0 : _a.id;
        } while (routeId);
        matchedRoutes.reverse();
      }
    }
  }
  if (matchedRoutes.length) {
    const middlewares = flattenMiddlewares(
      matchedRoutes.flatMap((r) => r.options.middleware).filter(Boolean)
    ).map((d) => d.options.server);
    if ((_b = serverTreeResult.foundRoute) == null ? void 0 : _b.options.methods) {
      const method = Object.keys(
        serverTreeResult.foundRoute.options.methods
      ).find(
        (method2) => method2.toLowerCase() === opts.request.method.toLowerCase()
      );
      if (method) {
        const handler = serverTreeResult.foundRoute.options.methods[method];
        if (handler) {
          if (typeof handler === "function") {
            middlewares.push(handlerToMiddleware(handler));
          } else {
            if (handler._options.middlewares && handler._options.middlewares.length) {
              middlewares.push(
                ...flattenMiddlewares(handler._options.middlewares).map(
                  (d) => d.options.server
                )
              );
            }
            if (handler._options.handler) {
              middlewares.push(handlerToMiddleware(handler._options.handler));
            }
          }
        }
      }
    }
    middlewares.push(handlerToMiddleware(opts.executeRouter));
    const ctx = await executeMiddleware(middlewares, {
      request: opts.request,
      context: {},
      params: serverTreeResult.routeParams,
      pathname
    });
    response = ctx.response;
  }
  return [matchedRoutes, response];
}
function handlerToMiddleware(handler) {
  return async ({ next: _next, ...rest }) => {
    const response = await handler(rest);
    if (response) {
      return { response };
    }
    return _next(rest);
  };
}
function executeMiddleware(middlewares, ctx) {
  let index = -1;
  const next = async (ctx2) => {
    index++;
    const middleware = middlewares[index];
    if (!middleware) return ctx2;
    const result = await middleware({
      ...ctx2,
      // Allow the middleware to call the next middleware in the chain
      next: async (nextCtx) => {
        const nextResult = await next({
          ...ctx2,
          ...nextCtx,
          context: {
            ...ctx2.context,
            ...(nextCtx == null ? void 0 : nextCtx.context) || {}
          }
        });
        return Object.assign(ctx2, handleCtxResult(nextResult));
      }
      // Allow the middleware result to extend the return context
    }).catch((err) => {
      if (isSpecialResponse(err)) {
        return {
          response: err
        };
      }
      throw err;
    });
    return Object.assign(ctx2, handleCtxResult(result));
  };
  return handleCtxResult(next(ctx));
}
function handleCtxResult(result) {
  if (isSpecialResponse(result)) {
    return {
      response: result
    };
  }
  return result;
}
function isSpecialResponse(err) {
  return isResponse(err) || isRedirect(err);
}
function isResponse(response) {
  return response instanceof Response;
}
function createServerFileRoute(_) {
  return createServerRoute();
}
function createServerRoute(__, __opts) {
  const options = __opts || {};
  const route = {
    isRoot: false,
    path: "",
    id: "",
    fullPath: "",
    to: "",
    options,
    parentRoute: void 0,
    _types: {},
    // children: undefined as TChildren,
    middleware: (middlewares) => createServerRoute(void 0, {
      ...options,
      middleware: middlewares
    }),
    methods: (methodsOrGetMethods) => {
      const methods = (() => {
        if (typeof methodsOrGetMethods === "function") {
          return methodsOrGetMethods(createMethodBuilder());
        }
        return methodsOrGetMethods;
      })();
      return createServerRoute(void 0, {
        ...__opts,
        methods
      });
    },
    update: (opts) => createServerRoute(void 0, {
      ...options,
      ...opts
    }),
    init: (opts) => {
      var _a;
      options.originalIndex = opts.originalIndex;
      const isRoot = !options.path && !options.id;
      route.parentRoute = (_a = options.getParentRoute) == null ? void 0 : _a.call(options);
      if (isRoot) {
        route.path = rootRouteId;
      } else if (!route.parentRoute) {
        throw new Error(`Child Route instances must pass a 'getParentRoute: () => ParentRoute' option that returns a ServerRoute instance.`);
      }
      let path = isRoot ? rootRouteId : options.path;
      if (path && path !== "/") {
        path = trimPathLeft(path);
      }
      const customId = options.id || path;
      let id = isRoot ? rootRouteId : joinPaths([route.parentRoute.id === rootRouteId ? "" : route.parentRoute.id, customId]);
      if (path === rootRouteId) {
        path = "/";
      }
      if (id !== rootRouteId) {
        id = joinPaths(["/", id]);
      }
      const fullPath = id === rootRouteId ? "/" : joinPaths([route.parentRoute.fullPath, path]);
      route.path = path;
      route.id = id;
      route.fullPath = fullPath;
      route.to = fullPath;
      route.isRoot = isRoot;
    },
    _addFileChildren: (children) => {
      if (Array.isArray(children)) {
        route.children = children;
      }
      if (typeof children === "object" && children !== null) {
        route.children = Object.values(children);
      }
      return route;
    },
    _addFileTypes: () => route
  };
  return route;
}
const createServerRootRoute = createServerRoute;
const createMethodBuilder = (__opts) => {
  return {
    _options: __opts || {},
    _types: {},
    middleware: (middlewares) => createMethodBuilder({
      ...__opts,
      middlewares
    }),
    handler: (handler) => createMethodBuilder({
      ...__opts,
      handler
    })
  };
};
function setupRouterSsrQueryIntegration(opts) {
  setupCoreRouterSsrQueryIntegration(opts);
  if (opts.wrapQueryClient === false) {
    return;
  }
  const OGWrap = opts.router.options.Wrap || Fragment;
  opts.router.options.Wrap = ({ children }) => {
    return /* @__PURE__ */ jsx(QueryClientProvider, { client: opts.queryClient, children: /* @__PURE__ */ jsx(OGWrap, { children }) });
  };
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "button";
  return /* @__PURE__ */ jsx(
    Comp,
    {
      "data-slot": "button",
      className: cn(buttonVariants({ variant, size, className })),
      ...props
    }
  );
}
function DefaultCatchBoundary({ error }) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId$1
  });
  console.error(error);
  return /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4", children: [
    /* @__PURE__ */ jsx(ErrorComponent, { error }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          type: "button",
          onClick: () => {
            router.invalidate();
          },
          children: "Try Again"
        }
      ),
      isRoot ? /* @__PURE__ */ jsx(Button, { asChild: true, variant: "secondary", children: /* @__PURE__ */ jsx(Link, { to: "/", children: "Home" }) }) : /* @__PURE__ */ jsx(Button, { asChild: true, variant: "secondary", children: /* @__PURE__ */ jsx(
        Link,
        {
          to: "/",
          onClick: (e) => {
            e.preventDefault();
            window.history.back();
          },
          children: "Go Back"
        }
      ) })
    ] })
  ] });
}
function DefaultNotFound() {
  return /* @__PURE__ */ jsxs("div", { className: "space-y-2 p-2", children: [
    /* @__PURE__ */ jsx("p", { children: "The page you are looking for does not exist." }),
    /* @__PURE__ */ jsxs("p", { className: "flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsx(Button, { type: "button", onClick: () => window.history.back(), children: "Go back" }),
      /* @__PURE__ */ jsx(Button, { asChild: true, variant: "secondary", children: /* @__PURE__ */ jsx(Link, { to: "/", children: "Home" }) })
    ] })
  ] });
}
const TanStackRouterDevtoolsPanel = function() {
  return null;
} ;
function sanitizeBase(base) {
  return base.replace(/^\/|\/$/g, "");
}
const createServerRpc = (functionId, serverBase, splitImportFn) => {
  invariant(
    splitImportFn,
    "🚨splitImportFn required for the server functions server runtime, but was not provided."
  );
  const sanitizedAppBase = sanitizeBase("/");
  const sanitizedServerBase = sanitizeBase(serverBase);
  const url = `${sanitizedAppBase ? `/${sanitizedAppBase}` : ``}/${sanitizedServerBase}/${functionId}`;
  return Object.assign(splitImportFn, {
    url,
    functionId
  });
};
const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    VITE_BASE_URL: z.url().default("http://localhost:3000"),
    BETTER_AUTH_SECRET: z.string().min(1),
    // OAuth2 providers, optional, update as needed
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional()
  },
  runtimeEnv: process.env
});
const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").$defaultFn(() => false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull()
});
const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" })
});
const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull()
});
const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => /* @__PURE__ */ new Date())
});
const recommendationsCache = pgTable("recommendations_cache", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  promptHash: text("prompt_hash").notNull(),
  recommendations: jsonb("recommendations").notNull(),
  explanation: text("explanation").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull()
});
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  account,
  recommendationsCache,
  session,
  user,
  verification
}, Symbol.toStringTag, { value: "Module" }));
const driver = postgres(env.DATABASE_URL);
const getDatabase = () => drizzle({
  client: driver,
  schema,
  casing: "snake_case"
});
const db = getDatabase();
const getAuthConfig = () => betterAuth({
  baseURL: env.VITE_BASE_URL,
  database: drizzleAdapter(db, {
    provider: "pg"
  }),
  // https://www.better-auth.com/docs/integrations/tanstack#usage-tips
  plugins: [reactStartCookies()],
  // https://www.better-auth.com/docs/concepts/session-management#session-caching
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60
      // 5 minutes
    }
  },
  // https://www.better-auth.com/docs/concepts/oauth
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET
    }
  },
  // https://www.better-auth.com/docs/authentication/email-password
  emailAndPassword: {
    enabled: true
  }
});
const auth = getAuthConfig();
const $getUser_createServerFn_handler = createServerRpc("src_lib_auth_functions_ts--_getUser_createServerFn_handler", "/_serverFn", (opts, signal) => {
  return $getUser.__executeServer(opts, signal);
});
const $getUser = createServerFn({
  method: "GET"
}).handler($getUser_createServerFn_handler, async () => {
  const session2 = await auth.api.getSession({
    headers: getWebRequest().headers
  });
  return session2?.user || null;
});
const authQueryOptions = () => queryOptions({
  queryKey: ["user"],
  queryFn: ({ signal }) => $getUser({ signal })
});
const appCss = "/assets/styles-D2PslAVt.css";
const MEDIA = "(prefers-color-scheme: dark)";
const initialState = {
  theme: "system",
  setTheme: () => null
};
const ThemeProviderContext = createContext(initialState);
function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  ...props
}) {
  const [theme, setTheme] = useState(
    () => defaultTheme
  );
  const handleMediaQuery = useCallback(
    (e) => {
      if (theme !== "system") return;
      const root = window.document.documentElement;
      const targetTheme = e.matches ? "dark" : "light";
      if (!root.classList.contains(targetTheme)) {
        root.classList.remove("light", "dark");
        root.classList.add(targetTheme);
      }
    },
    [theme]
  );
  useEffect(() => {
    const media = window.matchMedia(MEDIA);
    media.addEventListener("change", handleMediaQuery);
    handleMediaQuery(media);
    return () => media.removeEventListener("change", handleMediaQuery);
  }, [handleMediaQuery]);
  useEffect(() => {
    const root = window.document.documentElement;
    let targetTheme;
    if (theme === "system") {
      localStorage.removeItem(storageKey);
      targetTheme = window.matchMedia(MEDIA).matches ? "dark" : "light";
    } else {
      localStorage.setItem(storageKey, theme);
      targetTheme = theme;
    }
    if (!root.classList.contains(targetTheme)) {
      root.classList.remove("light", "dark");
      root.classList.add(targetTheme);
    }
  }, [theme, storageKey]);
  const value = useMemo(
    () => ({
      theme,
      setTheme
    }),
    [theme]
  );
  return /* @__PURE__ */ jsxs(ThemeProviderContext, { ...props, value, children: [
    /* @__PURE__ */ jsx(ScriptOnce, { children: `document.documentElement.classList.toggle(
            'dark',
            localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
            )` }),
    children
  ] });
}
const useTheme = () => {
  const context = use(ThemeProviderContext);
  if (context === void 0)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
const Toaster = ({ ...props }) => {
  const { theme } = useTheme();
  return /* @__PURE__ */ jsx(
    Toaster$1,
    {
      theme,
      className: "toaster group",
      style: {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)"
      },
      ...props
    }
  );
};
const useAudioStore = create()(
  (set, get) => ({
    playlist: [],
    currentSongIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.5,
    setPlaylist: (songs) => set({ playlist: songs, currentSongIndex: 0 }),
    playSong: (songId, newPlaylist) => {
      const state = get();
      let playlist = newPlaylist || state.playlist;
      let index = playlist.findIndex((song) => song.id === songId);
      if (index === -1) {
        index = 0;
        const foundSong = state.playlist.find((s) => s.id === songId);
        if (foundSong) {
          playlist = [foundSong];
        }
      }
      set({
        playlist,
        currentSongIndex: index,
        isPlaying: true
      });
    },
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setCurrentTime: (time) => set({ currentTime: time }),
    setDuration: (dur) => set({ duration: dur }),
    setVolume: (vol) => set({ volume: vol }),
    nextSong: () => {
      const state = get();
      if (state.playlist.length === 0) return;
      const newIndex = (state.currentSongIndex + 1) % state.playlist.length;
      set({ currentSongIndex: newIndex });
    },
    previousSong: () => {
      const state = get();
      if (state.playlist.length === 0) return;
      const newIndex = (state.currentSongIndex - 1 + state.playlist.length) % state.playlist.length;
      set({ currentSongIndex: newIndex });
    },
    clearPlaylist: () => set({ playlist: [], currentSongIndex: -1, isPlaying: false }),
    addPlaylist: (songs) => {
      set({ playlist: songs, currentSongIndex: 0, isPlaying: true });
    }
  })
);
function AudioPlayer() {
  const audioRef = useRef(null);
  const {
    playlist,
    currentSongIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    nextSong,
    previousSong
  } = useAudioStore();
  const currentSong = playlist[currentSongIndex];
  const loadSong = useCallback((song) => {
    const audio = audioRef.current;
    if (audio) {
      audio.src = song.url;
      audio.load();
      setCurrentTime(0);
      setDuration(0);
    }
  }, [setCurrentTime, setDuration]);
  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    }
  };
  const seek = (time) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  };
  const changeVolume = (newVolume) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const onCanPlay = () => {
    };
    const onWaiting = () => {
    };
    const onEnded = () => {
      nextSong();
    };
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("ended", onEnded);
    audio.volume = volume;
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("ended", onEnded);
    };
  }, [volume, currentSongIndex, setCurrentTime, setDuration, nextSong]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch((e) => console.error("Auto-play failed:", e));
    } else {
      audio.pause();
    }
  }, [isPlaying]);
  useEffect(() => {
    if (playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
      loadSong(playlist[currentSongIndex]);
    }
  }, [currentSongIndex, playlist, loadSong]);
  if (playlist.length === 0 || currentSongIndex === -1) return null;
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };
  return /* @__PURE__ */ jsxs("div", { className: "bg-background/95 backdrop-blur-sm border-t border-border/50 shadow-lg", children: [
    /* @__PURE__ */ jsx("div", { className: "max-w-6xl mx-auto px-4 py-3", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-4 flex-1 min-w-0", children: [
        /* @__PURE__ */ jsx("div", { className: "relative", children: /* @__PURE__ */ jsxs("div", { className: "w-12 h-12 bg-gradient-to-br from-muted to-muted-foreground/20 rounded-lg flex items-center justify-center overflow-hidden", children: [
          currentSong.artist && /* @__PURE__ */ jsx("span", { className: "text-xs font-medium text-muted-foreground/70 truncate w-20", children: currentSong.artist.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() }),
          isPlaying && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 animate-pulse rounded-lg" })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-semibold text-sm truncate", title: currentSong.name, children: currentSong.name }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground truncate", title: currentSong.artist || "Unknown Artist", children: currentSong.artist || "Unknown Artist" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-3 px-4", children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "ghost",
            size: "sm",
            className: "h-8 w-8 rounded-full hover:bg-accent/20 transition-colors",
            onClick: previousSong,
            children: /* @__PURE__ */ jsx(SkipBack, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "ghost",
            size: "sm",
            className: `h-10 w-10 rounded-full transition-all duration-200 ${isPlaying ? "bg-primary hover:bg-primary/90" : "bg-accent hover:bg-accent/80"}`,
            onClick: togglePlayPause,
            children: isPlaying ? /* @__PURE__ */ jsx(Pause, { className: "h-5 w-5" }) : /* @__PURE__ */ jsx(Play, { className: "h-5 w-5 ml-0.5" })
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "ghost",
            size: "sm",
            className: "h-8 w-8 rounded-full hover:bg-accent/20 transition-colors",
            onClick: nextSong,
            children: /* @__PURE__ */ jsx(SkipForward, { className: "h-4 w-4" })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2 min-w-[120px]", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs font-mono text-muted-foreground min-w-[3rem] text-right", children: formatTime(currentTime) }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 w-24 relative", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "range",
                value: currentTime,
                max: duration || 0,
                step: 0.1,
                onInput: (e) => seek(Number(e.target.value)),
                className: "w-full h-1.5 bg-muted/50 rounded-full appearance-none cursor-pointer relative z-10\n                    [&::-webkit-slider-thumb]:appearance-none\n                    [&::-webkit-slider-thumb]:h-3\n                    [&::-webkit-slider-thumb]:w-3\n                    [&::-webkit-slider-thumb]:bg-primary\n                    [&::-webkit-slider-thumb]:rounded-full\n                    [&::-webkit-slider-thumb]:shadow-md\n                    [&::-moz-range-thumb]:h-3\n                    [&::-moz-range-thumb]:w-3\n                    [&::-moz-range-thumb]:bg-primary\n                    [&::-moz-range-thumb]:rounded-full\n                    [&::-moz-range-thumb]:border-0\n                    disabled:opacity-50 disabled:cursor-not-allowed",
                disabled: !isPlaying,
                style: {
                  background: `linear-gradient(to right, var(--primary) ${currentTime / (duration || 1) * 100}%, var(--muted) ${currentTime / (duration || 1) * 100}%)`
                }
              }
            ),
            duration > 0 && /* @__PURE__ */ jsx(
              "div",
              {
                className: "absolute inset-0 h-1.5 bg-primary/20 rounded-full -z-10",
                style: { width: `${Math.min(100, currentTime / duration * 100)}%` }
              }
            )
          ] }),
          /* @__PURE__ */ jsx("span", { className: "text-xs font-mono text-muted-foreground min-w-[3rem]", children: formatTime(duration) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center space-x-2 pr-2", children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "ghost",
              size: "sm",
              className: "h-8 w-8 p-0 hover:bg-accent/20",
              onClick: () => changeVolume(volume > 0 ? 0 : 0.5),
              children: volume > 0 ? /* @__PURE__ */ jsx(Volume2, { className: "h-4 w-4" }) : /* @__PURE__ */ jsx(VolumeX, { className: "h-4 w-4" })
            }
          ),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "range",
              value: volume,
              max: 1,
              step: 0.05,
              onInput: (e) => changeVolume(Number(e.target.value)),
              className: "w-16 h-1.5 bg-muted/50 rounded-full appearance-none cursor-pointer\n                  [&::-webkit-slider-thumb]:appearance-none\n                  [&::-webkit-slider-thumb]:h-3\n                  [&::-webkit-slider-thumb]:w-3\n                  [&::-webkit-slider-thumb]:bg-primary\n                  [&::-webkit-slider-thumb]:rounded-full\n                  [&::-webkit-slider-thumb]:shadow-md\n                  [&::-moz-range-thumb]:h-3\n                  [&::-moz-range-thumb]:w-3\n                  [&::-moz-range-thumb]:bg-primary\n                  [&::-moz-range-thumb]:rounded-full\n                  [&::-moz-range-thumb]:border-0",
              style: {
                background: `linear-gradient(to right, var(--primary) ${volume * 100}%, var(--muted) ${volume * 100}%)`
              }
            }
          )
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("audio", { ref: audioRef, preload: "metadata" })
  ] });
}
const Route$c = createRootRouteWithContext()({
  beforeLoad: async ({ context }) => {
    const user2 = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true
    });
    return { user: user2 };
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8"
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      },
      {
        title: "AIDJ - AI-Assisted Music Library"
      },
      {
        name: "description",
        content: "AIDJ: Your AI-powered music library interface. Browse, stream, and manage your self-hosted music collection with modern UI and local privacy."
      },
      {
        name: "keywords",
        content: "music, library, streaming, AI, DJ, self-hosted, navidrome, privacy"
      },
      {
        name: "author",
        content: "AIDJ Team"
      },
      {
        property: "og:title",
        content: "AIDJ - AI-Assisted Music Library"
      },
      {
        property: "og:description",
        content: "Modern music library interface with AI recommendations and local privacy"
      },
      {
        property: "og:type",
        content: "website"
      },
      {
        name: "twitter:card",
        content: "summary_large_image"
      },
      {
        name: "twitter:title",
        content: "AIDJ - AI-Assisted Music Library"
      },
      {
        name: "twitter:description",
        content: "Your AI-powered music library interface"
      }
    ],
    links: [{ rel: "stylesheet", href: appCss }]
  }),
  component: RootComponent
});
function RootComponent() {
  const { isPlaying, playlist, currentSongIndex } = useAudioStore();
  const hasActiveSong = playlist.length > 0 && currentSongIndex >= 0;
  return /* @__PURE__ */ jsxs(RootDocument, { children: [
    /* @__PURE__ */ jsx("div", { className: `transition-all duration-300 ${hasActiveSong ? "pb-16" : ""}`, children: /* @__PURE__ */ jsx(Outlet, {}) }),
    hasActiveSong && /* @__PURE__ */ jsx("div", { className: `transition-all duration-300 fixed bottom-0 left-0 right-0 z-50 ${isPlaying ? "bg-background border-t" : "opacity-50"}`, children: /* @__PURE__ */ jsx(AudioPlayer, {}) })
  ] });
}
function RootDocument({ children }) {
  return (
    // suppress since we're updating the "dark" class in ThemeProvider
    /* @__PURE__ */ jsxs("html", { lang: "en", suppressHydrationWarning: true, children: [
      /* @__PURE__ */ jsx("head", { children: /* @__PURE__ */ jsx(HeadContent, {}) }),
      /* @__PURE__ */ jsxs("body", { children: [
        /* @__PURE__ */ jsxs(ThemeProvider, { children: [
          children,
          /* @__PURE__ */ jsx(Toaster, { richColors: true })
        ] }),
        /* @__PURE__ */ jsx(
          TanStackDevtools,
          {
            plugins: [
              {
                name: "TanStack Query",
                render: /* @__PURE__ */ jsx(ReactQueryDevtoolsPanel, {})
              },
              {
                name: "TanStack Router",
                render: /* @__PURE__ */ jsx(TanStackRouterDevtoolsPanel, {})
              }
            ]
          }
        ),
        /* @__PURE__ */ jsx(Scripts, {})
      ] })
    ] })
  );
}
const $$splitComponentImporter$b = () => import('./config-e6H7EwX0.mjs');
const Route$b = createFileRoute("/config")({
  component: lazyRouteComponent($$splitComponentImporter$b, "component")
});
const $$splitComponentImporter$a = () => import('./route-CWYgZ3b7.mjs');
const Route$a = createFileRoute("/dashboard")({
  component: lazyRouteComponent($$splitComponentImporter$a, "component"),
  beforeLoad: async ({
    context
  }) => {
    if (!context.user) {
      throw redirect({
        to: "/login"
      });
    }
  }
});
const $$splitComponentImporter$9 = () => import('./route-BvJcXBet.mjs');
const Route$9 = createFileRoute("/(auth)")({
  component: lazyRouteComponent($$splitComponentImporter$9, "component"),
  beforeLoad: async ({
    context
  }) => {
    const REDIRECT_URL = "/dashboard";
    if (context.user) {
      throw redirect({
        to: REDIRECT_URL
      });
    }
    return {
      redirectUrl: REDIRECT_URL
    };
  }
});
const $$splitComponentImporter$8 = () => import('./index-Drn_zOcs.mjs');
const Route$8 = createFileRoute("/")({
  component: lazyRouteComponent($$splitComponentImporter$8, "component"),
  loader: ({
    context
  }) => {
    return {
      user: context.user
    };
  }
});
const $$splitComponentImporter$7 = () => import('./index-Dp4WoJar.mjs');
const Route$7 = createFileRoute("/dashboard/")({
  component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
const $$splitComponentImporter$6 = () => import('./search-Z6a0SiXq.mjs');
const Route$6 = createFileRoute("/library/search")({
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import('./artists-B6sUB2vv.mjs');
const Route$5 = createFileRoute("/library/artists")({
  loader: async () => {
    return {};
  },
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import('./signup-B3wloPnS.mjs');
const Route$4 = createFileRoute("/(auth)/signup")({
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const $$splitComponentImporter$3 = () => import('./login-CH8FbVqW.mjs');
const Route$3 = createFileRoute("/(auth)/login")({
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import('./_id_-2hXJE3IJ.mjs');
const Route$2 = createFileRoute("/library/artists/id")({
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const $$splitComponentImporter$1 = () => import('./_id_-o3HuTrGr.mjs');
const Route$1 = createFileRoute("/dashboard/recommendations/id")({
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import('./_albumId_-Bn90iuU4.mjs');
const Route = createFileRoute("/library/artists/id/albums/albumId")({
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const ollamaUrl = "http://10.0.0.30:30068";
const navidromeUrl = "http://10.0.0.30:4533";
const lidarrUrl = "http://10.0.0.30:8686";
const lidarrApiKey = "";
const navidromeUsername = "juan";
const navidromePassword = "GoldSoul40";
const defaults = {
  ollamaUrl,
  navidromeUrl,
  lidarrUrl,
  lidarrApiKey,
  navidromeUsername,
  navidromePassword
};
let currentConfig = { ...defaults, lidarrApiKey: "" };
{
  currentConfig = {
    ...defaults,
    lidarrApiKey: process.env.LIDARR_API_KEY || "",
    navidromeUsername: process.env.NAVIDROME_USERNAME || defaults.navidromeUsername,
    navidromePassword: process.env.NAVIDROME_PASSWORD || defaults.navidromePassword
  };
}
function getConfig() {
  return currentConfig;
}
function setConfig(cfg) {
  currentConfig = { ...currentConfig, ...cfg };
}
let token = null;
let clientId = null;
let subsonicToken = null;
let subsonicSalt = null;
let tokenExpiry = 0;
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1e3;
async function getAuthToken() {
  const config = getConfig();
  if (!config.navidromeUrl || !config.navidromeUsername || !config.navidromePassword) {
    throw new Error("Navidrome credentials incomplete");
  }
  const now = Date.now();
  if (token && now < tokenExpiry - TOKEN_REFRESH_THRESHOLD) {
    return token;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5e3);
  try {
    const response = await fetch(`${config.navidromeUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: config.navidromeUsername,
        password: config.navidromePassword
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Login failed: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.token || !data.id) {
      throw new Error("No token or id received from login");
    }
    token = data.token;
    clientId = data.id;
    subsonicToken = data.subsonicToken;
    subsonicSalt = data.subsonicSalt;
    tokenExpiry = now + 3600 * 1e3;
    return token;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Login request timed out");
    }
    throw new Error(`Authentication error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
async function apiFetch$1(endpoint, options = {}) {
  let retries = 0;
  const maxRetries = 1;
  while (retries <= maxRetries) {
    const authToken = await getAuthToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5e3);
    try {
      const ndId = clientId;
      if (!ndId) {
        throw new Error("Client ID not available");
      }
      const response = await fetch(`${getConfig().navidromeUrl}${endpoint}`, {
        ...options,
        headers: {
          "x-nd-authorization": `Bearer ${authToken}`,
          "x-nd-client-unique-id": ndId,
          ...options.headers
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.status === 401) {
        token = null;
        clientId = null;
        retries++;
        continue;
      }
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      }
      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("API request timed out (5s limit)");
      }
      if (retries < maxRetries) {
        retries++;
        continue;
      }
      throw new Error(`API fetch error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  throw new Error("Max retries exceeded for API request");
}
async function getArtists(start = 0, limit = 1e3) {
  try {
    const endpoint = `/api/artist?_start=${start}&_end=${start + limit - 1}`;
    const data = await apiFetch$1(endpoint);
    return data || [];
  } catch (error) {
    throw new Error(`Failed to fetch artists: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
async function getArtistDetail(id) {
  try {
    const data = await apiFetch$1(`/api/artist/${id}`);
    return data;
  } catch (error) {
    throw new Error(`Failed to fetch artist detail: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
async function getArtistsWithDetails(start = 0, limit = 1e3) {
  try {
    const basicArtists = await getArtists(start, limit);
    const detailedArtists = await Promise.all(
      basicArtists.map(async (artist) => {
        const detail = await getArtistDetail(artist.id);
        return { ...artist, ...detail };
      })
    );
    return detailedArtists;
  } catch (error) {
    throw new Error(`Failed to fetch artists with details: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
async function getAlbums(artistId, start = 0, limit = 50) {
  try {
    const data = await apiFetch$1(`/api/album?artist_id=${artistId}&_start=${start}&_end=${start + limit - 1}`);
    return data || [];
  } catch (error) {
    throw new Error(`Failed to fetch albums: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
async function getSongs(albumId, start = 0, limit = 50) {
  try {
    const data = await apiFetch$1(`/api/song?album_id=${albumId}&_start=${start}&_end=${start + limit - 1}`);
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`
    }));
    return songs || [];
  } catch (error) {
    throw new Error(`Failed to fetch songs: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
async function search(query, start = 0, limit = 5) {
  try {
    const config = getConfig();
    if (!config.navidromeUrl) {
      throw new Error("Navidrome URL not configured");
    }
    const match = query.match(/^(.+?)\s*-\s*(.+)$/);
    const artist = match ? match[1].trim() : "";
    const title = match ? match[2].trim() : query;
    const searchParams = [
      { param: "title", value: title },
      // Exact title
      { param: "fullText", value: `${artist} ${title}` },
      // Artist + title
      { param: "fullText", value: query }
      // Fallback fullText
    ];
    let data = [];
    for (const param of searchParams) {
      try {
        const endpoint = `/api/song?${param.param}=${encodeURIComponent(param.value)}&_start=${start}&_end=${start + limit - 1}`;
        console.log(`Trying search with parameter ${param.param}:`, endpoint);
        data = await apiFetch$1(endpoint);
        if (data && data.length > 0) {
          console.log(`Search with ${param.param} returned ${data.length} results`);
          break;
        }
      } catch (paramError) {
        console.log(`Search with ${param.param} failed:`, paramError);
        continue;
      }
    }
    if (data.length === 0) {
      console.log("No results from any search parameter");
      return [];
    }
    const filtered = data.filter((song) => {
      const songName = (song.name || song.title || "").toLowerCase();
      const artistLower = artist.toLowerCase();
      const titleLower = title.toLowerCase();
      return songName.includes(artistLower) && songName.includes(titleLower);
    });
    console.log(`Filtered to ${filtered.length} better matches from ${data.length} total`);
    const songs = filtered.slice(0, limit).map((song) => ({
      ...song,
      name: song.name || song.title || "Unknown Title",
      url: `/api/navidrome/stream/${song.id}`
    }));
    console.log("Final processed search results:", songs.length, "songs");
    return songs;
  } catch (error) {
    console.error("Comprehensive search error:", error);
    throw new Error(`Failed to search music: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
async function getSongsGlobal(start = 0, limit = 50) {
  try {
    const data = await apiFetch$1(`/api/song?_start=${start}&_end=${start + limit - 1}`);
    const songs = data.map((song) => ({
      ...song,
      url: `/api/navidrome/stream/${song.id}`
    }));
    return songs || [];
  } catch (error) {
    throw new Error(`Failed to fetch global songs: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
async function getLibrarySummary() {
  try {
    const topArtists = await getArtistsWithDetails(0, 20);
    const topSongs = await getSongsGlobal(0, 10);
    return {
      artists: topArtists.map((a) => ({
        name: a.name,
        genres: a.genres || "Unknown"
      })),
      songs: topSongs.map((s) => s.name)
    };
  } catch (error) {
    throw new Error(`Failed to fetch library summary: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
const OLLAMA_BASE_URL = getConfig().ollamaUrl || "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama2";
class OllamaError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "OllamaError";
  }
}
async function retryFetch(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fn();
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt) * 1e3;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
async function generateRecommendations({ prompt, model = DEFAULT_MODEL, userId }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3e4);
  let enhancedPrompt = prompt;
  if (userId) {
    try {
      const summary = await getLibrarySummary();
      const artistsList = summary.artists.map((a) => `${a.name} (${a.genres})`).join(", ");
      const songsList = summary.songs.slice(0, 10).join(", ");
      enhancedPrompt = `${prompt}. Use only songs from my library: artists [${artistsList}], example songs [${songsList}]. Suggest exact matches like "Artist - Title".`;
    } catch (error) {
      console.warn("Failed to fetch library summary for recommendations:", error);
    }
  }
  const url = `${OLLAMA_BASE_URL}/api/generate`;
  const body = {
    model,
    prompt: `Respond ONLY with valid JSON. No other text, explanations, or conversation. Generate 5 music recommendations based on: ${enhancedPrompt}. JSON: {"recommendations": [{"song": "Artist - Title", "explanation": "brief reason why recommended"}, ...]}`,
    stream: false
  };
  try {
    const response = await retryFetch(() => fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    }));
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new OllamaError("API_ERROR", `Ollama API error: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.response) {
      throw new OllamaError("PARSE_ERROR", "No response from Ollama");
    }
    let parsed;
    try {
      parsed = JSON.parse(data.response);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Response:", data.response);
      const fallback = data.response.match(/song["']?\s*:\s*["']([^"']+)["']/gi) || [];
      const recs = fallback.slice(0, 5).map((match) => ({ song: match.replace(/song["']?\s*:\s*["']/, "").replace(/["']$/, ""), explanation: "Recommended based on your preferences" }));
      return { recommendations: recs };
    }
    if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
      throw new OllamaError("PARSE_ERROR", "Invalid recommendations format");
    }
    return {
      recommendations: parsed.recommendations.map((r) => ({ song: r.song, explanation: r.explanation }))
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OllamaError("TIMEOUT_ERROR", "Ollama request timed out after 30s");
    }
    throw error;
  }
}
async function generatePlaylist({ style, summary }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5e3);
  const topArtists = summary.artists.slice(0, 20).map((a) => `${a.name} (${a.genres || "Unknown"})`).join("; ");
  const topSongs = summary.songs.slice(0, 20).join("; ");
  const prompt = `Respond with ONLY valid JSON - no other text or explanations! STRICTLY use ONLY songs from my library. My library artists: [${topArtists}]. Example songs: [${topSongs}]. Generate exactly 10 songs for style "${style}" as "Artist - Title" format, where Artist and Title are EXACT matches from my library. If no exact match, do not suggest it - use only available. Format: {"playlist": [{"song": "Exact Artist - Exact Title", "explanation": "1 sentence why it fits ${style} from library"}]} . Double-check all suggestions are from the provided library list.`;
  const url = `${OLLAMA_BASE_URL}/api/generate`;
  const body = {
    model: DEFAULT_MODEL,
    prompt,
    stream: false
  };
  try {
    const response = await retryFetch(() => fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    }));
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new OllamaError("API_ERROR", `Ollama API error: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.response) {
      throw new OllamaError("PARSE_ERROR", "No response from Ollama");
    }
    let parsed;
    try {
      parsed = JSON.parse(data.response);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Response:", data.response);
      const fallback = data.response.match(/song["']?\s*:\s*["']([^"']+)["']/gi) || [];
      const recs = fallback.slice(0, 10).map((match) => {
        const song = match.replace(/song["']?\s*:\s*["']/, "").replace(/["']$/, "");
        return { song, explanation: "Fits the requested style based on your library" };
      });
      return { playlist: recs };
    }
    if (!parsed.playlist || !Array.isArray(parsed.playlist)) {
      throw new OllamaError("PARSE_ERROR", "Invalid playlist format");
    }
    return {
      playlist: parsed.playlist.slice(0, 10)
      // Ensure max 10
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OllamaError("TIMEOUT_ERROR", "Ollama request timed out after 30s");
    }
    throw error;
  }
}
const ServerRoute$9 = createServerFileRoute().methods({
  POST: async ({
    request
  }) => {
    const session2 = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true
      }
    });
    if (!session2) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    try {
      const {
        prompt,
        model
      } = await request.json();
      if (!prompt) {
        return new Response(JSON.stringify({
          error: "Prompt required"
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      const recommendations = await generateRecommendations({
        prompt,
        model,
        userId: session2.user.id
      });
      return new Response(JSON.stringify({
        data: recommendations
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      console.error("Recommendation generation failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({
        error: "Failed to generate recommendations",
        details: message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  }
});
const ServerRoute$8 = createServerFileRoute().methods({
  POST: async ({
    request
  }) => {
    const {
      auth: auth2
    } = await import('./server-BqeE0TjR.mjs');
    const session2 = await auth2.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true
      }
    });
    if (!session2) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    try {
      const {
        style
      } = await request.json();
      if (!style) {
        return new Response(JSON.stringify({
          error: "Style required"
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      const summary = await getLibrarySummary();
      console.log("Library summary for playlist:", summary);
      const {
        playlist: suggestions
      } = await generatePlaylist({
        style,
        summary
      });
      console.log("Generated playlist suggestions:", suggestions);
      const resolvedPlaylist = await Promise.all(suggestions.map(async (suggestion) => {
        try {
          const matches = await search(suggestion.song, 0, 1);
          if (matches.length > 0) {
            const song = matches[0];
            return {
              ...suggestion,
              songId: song.id,
              url: song.url
            };
          } else {
            return {
              ...suggestion,
              songId: null,
              url: null,
              missing: true
            };
          }
        } catch (error) {
          console.error(`Resolution error for ${suggestion.song}:`, error);
          return {
            ...suggestion,
            songId: null,
            url: null,
            missing: true
          };
        }
      }));
      console.log("Resolved playlist:", resolvedPlaylist);
      return new Response(JSON.stringify({
        data: {
          playlist: resolvedPlaylist
        }
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      console.error("Playlist generation failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({
        error: "Failed to generate playlist",
        details: message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  }
});
const ServerRoute$7 = createServerFileRoute().methods({
  GET: async () => {
    const cfg = getConfig();
    return new Response(JSON.stringify({
      ok: true,
      config: cfg
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  },
  POST: async ({
    request
  }) => {
    try {
      const body = await request.json();
      if (body?.test === true) {
        const cfg = getConfig();
        const statuses = {};
        const test = async (label, url) => {
          if (!url) {
            statuses[label] = "Not configured";
            return;
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          try {
            const res = await fetch(url, {
              method: "GET",
              signal: controller.signal
            });
            clearTimeout(timeout);
            statuses[label] = res.ok ? "reachable" : `http ${res.status}`;
          } catch {
            statuses[label] = "unreachable";
          }
        };
        await Promise.all([test("ollamaUrl", cfg.ollamaUrl), test("navidromeUrl", cfg.navidromeUrl), test("lidarrUrl", cfg.lidarrUrl)]);
        return new Response(JSON.stringify({
          ok: true,
          statuses
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      const allowed = {};
      if (typeof body.ollamaUrl === "string") allowed.ollamaUrl = body.ollamaUrl;
      if (typeof body.navidromeUrl === "string") allowed.navidromeUrl = body.navidromeUrl;
      if (typeof body.lidarrUrl === "string") allowed.lidarrUrl = body.lidarrUrl;
      if (typeof body.navidromeUsername === "string") allowed.navidromeUsername = body.navidromeUsername;
      if (typeof body.navidromePassword === "string") allowed.navidromePassword = body.navidromePassword;
      if (!Object.keys(allowed).length) {
        return new Response(JSON.stringify({
          ok: true,
          config: getConfig()
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      setConfig(allowed);
      await saveConfigToDb(allowed);
      return new Response(JSON.stringify({
        ok: true,
        config: getConfig()
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch {
      return new Response(JSON.stringify({
        error: "Configuration update failed"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  }
});
async function saveConfigToDb(cfg) {
  if (!cfg || Object.keys(cfg).length === 0) return;
  const hasAny = !!(cfg.ollamaUrl || cfg.navidromeUrl || cfg.lidarrUrl || cfg.navidromeUsername || cfg.navidromePassword);
  if (!hasAny) return;
  try {
    const pathMod = await import('path');
    const fsMod = await import('fs/promises');
    const CONFIG_PATH = pathMod.resolve(process.cwd(), "db", "config.json");
    await fsMod.mkdir(pathMod.dirname(CONFIG_PATH), {
      recursive: true
    });
    let existing = {};
    try {
      const raw = await fsMod.readFile(CONFIG_PATH, "utf8");
      existing = JSON.parse(raw);
    } catch {
      existing = {};
    }
    const merged = {
      ...existing,
      ...cfg
    };
    await fsMod.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2));
  } catch {
  }
}
const LIDARR_BASE_URL = getConfig().lidarrUrl || "http://localhost:8686";
let cachedKey = null;
function getObfuscatedKey(key) {
  return btoa(key);
}
function getDeobfuscatedKey(obfuscatedKey) {
  return atob(obfuscatedKey);
}
function getApiKey() {
  if (cachedKey) return cachedKey;
  const configKey = getConfig().lidarrApiKey;
  if (!configKey) {
    throw new LidarrError("CONFIG_ERROR", "Lidarr API key not configured");
  }
  const sessionKey = sessionStorage.getItem("lidarr_obfuscated_key");
  if (sessionKey) {
    cachedKey = getDeobfuscatedKey(sessionKey);
  } else {
    const obfuscated = getObfuscatedKey(configKey);
    sessionStorage.setItem("lidarr_obfuscated_key", obfuscated);
    cachedKey = configKey;
  }
  return cachedKey;
}
class LidarrError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "LidarrError";
  }
}
async function apiFetch(endpoint, options = {}, attempt = 1) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5e3);
  try {
    const url = `${LIDARR_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "X-Api-Key": getApiKey(),
        "Content-Type": "application/json",
        ...options.headers
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new LidarrError("API_ERROR", `Lidarr API error: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LidarrError("TIMEOUT_ERROR", "Lidarr request timed out after 5s");
    }
    if (attempt < 3 && (error instanceof LidarrError && (error.code === "TIMEOUT_ERROR" || error.code.startsWith("5")) || error instanceof TypeError)) {
      const delay = Math.pow(2, attempt) * 1e3;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiFetch(endpoint, options, attempt + 1);
    }
    throw error;
  }
}
async function searchArtist(term, limit = 20) {
  try {
    const params = new URLSearchParams({ term, limit: limit.toString() });
    const response = await apiFetch(`/api/v1/artist/lookup?${params}`);
    if (response && typeof response === "object" && "message" in response) {
      throw new LidarrError("METADATA_ERROR", response.message || "Lidarr metadata service failed");
    }
    return response || [];
  } catch (error) {
    throw new LidarrError("SEARCH_ERROR", `Failed to search artist: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
async function addArtistToQueue(foreignArtistId, artistName) {
  try {
    const config = getConfig();
    const addRequest = {
      artistId: foreignArtistId,
      // Foreign ID as string for MusicBrainz
      monitor: true,
      monitorDiscography: true,
      qualityProfileId: config.lidarrQualityProfileId || 1,
      rootFolderPath: config.lidarrRootFolderPath || "/music",
      addAlbums: true
    };
    await apiFetch("/api/v1/artist", {
      method: "POST",
      body: JSON.stringify(addRequest)
    });
    return { success: true, message: `Added "${artistName}" to Lidarr download queue.` };
  } catch (error) {
    throw new LidarrError("ADD_ERROR", `Failed to add artist: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
const ServerRoute$6 = createServerFileRoute().methods({
  POST: async ({
    request
  }) => {
    const {
      auth: auth2
    } = await import('./server-BqeE0TjR.mjs');
    const session2 = await auth2.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true
      }
    });
    if (!session2) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    try {
      const {
        song
      } = await request.json();
      console.log("Lidarr add request for song:", song);
      if (!song) {
        return new Response(JSON.stringify({
          error: "Song suggestion required"
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      const match = song.match(/^(.+?)\s*-\s*(.+)$/);
      console.log("Parsed artist/title:", match);
      if (!match) {
        return new Response(JSON.stringify({
          error: 'Invalid song format. Expected "Artist - Title"'
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      const artistName = match[1].trim();
      const results = await searchArtist(artistName);
      if (results.length === 0) {
        return new Response(JSON.stringify({
          error: "Artist not found in Lidarr search"
        }), {
          status: 404,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      const artist = results[0];
      await addArtistToQueue(artist.foreignArtistId, artist.artistName);
      return new Response(JSON.stringify({
        success: true,
        message: `Added "${artist.artistName}" to Lidarr queue.`
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      console.error("Lidarr add failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({
        error: "Failed to add to Lidarr",
        details: message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  }
});
const ServerRoute$5 = createServerFileRoute().methods({
  POST: async ({
    request
  }) => {
    try {
      const body = await request.json();
      const {
        name,
        email,
        password
      } = body;
      const api = auth.api;
      const regFn = api?.register ?? api?.signup;
      if (typeof regFn === "function") {
        const payload = {
          email,
          password
        };
        if (name) payload.name = name;
        const result = await regFn(payload);
        return new Response(JSON.stringify({
          ok: true,
          result
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      return new Response(JSON.stringify({
        error: "Registration API not available"
      }), {
        status: 501,
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Registration failed";
      return new Response(JSON.stringify({
        error: message
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  }
});
const ServerRoute$4 = createServerFileRoute().methods({
  POST: async ({
    request
  }) => {
    try {
      const body = await request.json();
      const {
        email,
        password
      } = body;
      const api = auth.api;
      const loginFn = api?.login;
      if (typeof loginFn === "function") {
        const payload = {
          email,
          password
        };
        const result = await loginFn(payload);
        return new Response(JSON.stringify({
          ok: true,
          result
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      return new Response(JSON.stringify({
        error: "Login API not available"
      }), {
        status: 501,
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (e) {
      let message = "Login failed";
      if (e instanceof Error) {
        message = e.message;
      } else if (typeof e === "string") {
        message = e;
      }
      return new Response(JSON.stringify({
        error: message
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  }
});
const ServerRoute$3 = createServerFileRoute().methods({
  GET: ({
    request
  }) => {
    return auth.handler(request);
  },
  POST: ({
    request
  }) => {
    return auth.handler(request);
  }
});
const ServerRoute$2 = createServerFileRoute().methods({
  async GET({
    request,
    params
  }) {
    console.log("Stream route hit:", request.url);
    const config = getConfig();
    if (!config.navidromeUrl) {
      console.error("Navidrome URL not configured");
      return new Response("Navidrome not configured", {
        status: 500
      });
    }
    await getAuthToken();
    if (!subsonicToken || !subsonicSalt) {
      console.error("Subsonic authentication missing");
      return new Response("Not authenticated", {
        status: 401
      });
    }
    const {
      id: songId
    } = params;
    console.log("Song ID from params:", songId);
    if (!songId || songId.length < 10) {
      console.error("Invalid song ID:", songId);
      return new Response("Invalid song ID", {
        status: 400
      });
    }
    const streamUrl = new URL(`${config.navidromeUrl}/rest/stream`);
    streamUrl.searchParams.set("id", songId);
    streamUrl.searchParams.set("format", "mp3");
    streamUrl.searchParams.set("maxBitRate", "320");
    streamUrl.searchParams.set("client", "MusicApp");
    streamUrl.searchParams.set("version", "1.16.0");
    streamUrl.searchParams.set("c", "MusicApp");
    streamUrl.searchParams.set("f", "raw");
    const timestamp2 = Math.floor(Date.now() / 1e3).toString();
    const salt = subsonicSalt;
    const tokenHash = createHash("md5").update(`${subsonicToken}${timestamp2}${salt}`).digest("hex");
    streamUrl.searchParams.set("u", config.navidromeUsername || "admin");
    streamUrl.searchParams.set("t", subsonicToken);
    streamUrl.searchParams.set("s", salt);
    streamUrl.searchParams.set("ts", timestamp2);
    streamUrl.searchParams.set("token", tokenHash);
    streamUrl.searchParams.set("v", "1.16.0");
    const requestUrl = new URL(request.url);
    for (const [key, value] of requestUrl.searchParams) {
      if (!streamUrl.searchParams.has(key)) {
        streamUrl.searchParams.set(key, value);
      }
    }
    console.log("Built stream URL with song ID:", songId);
    const headers = new Headers();
    const range = request.headers.get("range");
    if (range) {
      headers.set("Range", range);
      console.log("Forwarding range request:", range);
    }
    headers.set("User-Agent", "MusicApp/1.0");
    headers.set("Accept", "*/*");
    try {
      const response = await fetch(streamUrl.toString(), {
        method: "GET",
        headers
      });
      console.log("Navidrome response:", response.status, response.statusText);
      console.log("Content-Type:", response.headers.get("content-type"));
      console.log("Content-Length:", response.headers.get("content-length") || "unknown");
      if (!response.ok) {
        let errorText = "(no body)";
        try {
          errorText = await response.text();
        } catch {
        }
        console.error("Navidrome stream failed:", response.status, errorText);
        return new Response(`Stream failed: ${response.status} - ${errorText}`, {
          status: response.status,
          headers: {
            "Content-Type": "text/plain"
          }
        });
      }
      const clonedHeaders = new Headers(response.headers);
      clonedHeaders.set("Access-Control-Allow-Origin", "*");
      clonedHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      clonedHeaders.set("Access-Control-Allow-Headers", "Range, *");
      clonedHeaders.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range");
      clonedHeaders.set("Cache-Control", "no-cache");
      clonedHeaders.set("Accept-Ranges", "bytes");
      const contentType = response.headers.get("content-type") || "audio/mpeg";
      clonedHeaders.set("Content-Type", contentType);
      console.log("Proxying audio stream, content-type:", contentType);
      return new Response(response.body, {
        status: response.status,
        headers: clonedHeaders
      });
    } catch (error) {
      console.error("Proxy fetch error:", error);
      return new Response(`Proxy error: ${String(error)}`, {
        status: 500
      });
    }
  },
  OPTIONS() {
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Range, Content-Type, Accept");
    headers.set("Access-Control-Max-Age", "86400");
    return new Response(null, {
      status: 204,
      headers
    });
  }
});
const ServerRoute$1 = createServerFileRoute().methods({
  GET: async ({
    params,
    request
  }) => {
    const config = getConfig();
    if (!config.navidromeUrl) {
      return new Response("Navidrome not configured", {
        status: 500
      });
    }
    await getAuthToken();
    const path = params.path.join("/");
    if (path.split("/")[0] === "stream") {
      console.log("Catch-all skipping stream path:", path, "- handled by specific route");
      return new Response("Stream path handled by specific route", {
        status: 404
      });
    }
    const url = new URL(`${config.navidromeUrl}/${path}`);
    url.search = new URL(request.url).search;
    url.search = new URL(request.url).search;
    const headers = new Headers(request.headers);
    headers.delete("host");
    if (token && clientId) {
      headers.set("x-nd-authorization", `Bearer ${token}`);
      headers.set("x-nd-client-unique-id", clientId);
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers
    });
    const clonedHeaders = new Headers(response.headers);
    clonedHeaders.set("Access-Control-Allow-Origin", "*");
    clonedHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    clonedHeaders.set("Access-Control-Allow-Headers", "*");
    const contentType = response.headers.get("content-type");
    console.log("Catch-all response content-type:", contentType);
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: clonedHeaders
      });
    } else {
      const buffer = await response.arrayBuffer();
      return new Response(buffer, {
        status: response.status,
        headers: clonedHeaders
      });
    }
  }
});
const ServerRoute = createServerFileRoute().methods({
  GET: async ({
    params,
    request
  }) => {
    const config = getConfig();
    if (!config.navidromeUrl || !config.navidromeUsername) {
      return new Response("Navidrome not configured", {
        status: 500
      });
    }
    await getAuthToken();
    if (!subsonicToken || !subsonicSalt) {
      return new Response("Authentication not ready", {
        status: 401
      });
    }
    const songId = params.id;
    console.log("Stream request - songId:", songId);
    console.log("Stream auth - subsonicToken exists:", !!subsonicToken);
    console.log("Stream auth - subsonicSalt exists:", !!subsonicSalt);
    const url = new URL(`${config.navidromeUrl}/rest/stream`);
    url.searchParams.append("u", config.navidromeUsername);
    url.searchParams.append("t", subsonicToken);
    url.searchParams.append("s", subsonicSalt);
    url.searchParams.append("f", "json");
    url.searchParams.append("v", "1.8.0");
    url.searchParams.append("c", "NavidromeUI");
    url.searchParams.append("id", songId);
    const range = request.headers.get("range");
    if (range) {
      url.searchParams.append("_range", range);
      console.log("Stream range request:", range);
    }
    console.log("Full streaming URL (matching official):", url.toString());
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("Accept", "audio/*, */*");
    console.log("Stream fetch headers:", Object.fromEntries(headers.entries()));
    const response = await fetch(url.toString(), {
      method: "GET",
      headers
    });
    console.log("Navidrome stream response status:", response.status, response.statusText);
    console.log("Navidrome stream response headers:", Object.fromEntries(response.headers.entries()));
    console.log("Navidrome stream content-type:", response.headers.get("content-type"));
    console.log("Navidrome stream content-length:", response.headers.get("content-length"));
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Stream fetch failed - full error:", errorText);
      return new Response(`Failed to stream audio from Navidrome: ${response.status} ${errorText.substring(0, 300)}`, {
        status: 502
      });
    }
    const contentType = response.headers.get("content-type") || "";
    console.log("Stream content-type (may be octet-stream):", contentType);
    const clonedHeaders = new Headers(response.headers);
    clonedHeaders.set("Access-Control-Allow-Origin", "*");
    clonedHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    clonedHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type, Accept");
    clonedHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
    clonedHeaders.set("Pragma", "no-cache");
    clonedHeaders.set("Expires", "0");
    const streamingHeaders = ["accept-ranges", "content-length", "content-range", "content-type", "content-encoding", "content-disposition", "transfer-encoding"];
    streamingHeaders.forEach((header) => {
      const value = response.headers.get(header);
      if (value) {
        clonedHeaders.set(header, value);
      }
    });
    console.log("Stream proxy returning - content-type:", contentType, "length:", response.headers.get("content-length"));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: clonedHeaders
    });
  }
});
const rootServerRouteImport = createServerRootRoute();
const ConfigRoute = Route$b.update({
  id: "/config",
  path: "/config",
  getParentRoute: () => Route$c
});
const DashboardRouteRoute = Route$a.update({
  id: "/dashboard",
  path: "/dashboard",
  getParentRoute: () => Route$c
});
const authRouteRoute = Route$9.update({
  id: "/(auth)",
  getParentRoute: () => Route$c
});
const IndexRoute = Route$8.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$c
});
const DashboardIndexRoute = Route$7.update({
  id: "/",
  path: "/",
  getParentRoute: () => DashboardRouteRoute
});
const LibrarySearchRoute = Route$6.update({
  id: "/library/search",
  path: "/library/search",
  getParentRoute: () => Route$c
});
const LibraryArtistsRoute = Route$5.update({
  id: "/library/artists",
  path: "/library/artists",
  getParentRoute: () => Route$c
});
const authSignupRoute = Route$4.update({
  id: "/signup",
  path: "/signup",
  getParentRoute: () => authRouteRoute
});
const authLoginRoute = Route$3.update({
  id: "/login",
  path: "/login",
  getParentRoute: () => authRouteRoute
});
const LibraryArtistsIdRoute = Route$2.update({
  id: "/id",
  path: "/id",
  getParentRoute: () => LibraryArtistsRoute
});
const DashboardRecommendationsIdRoute = Route$1.update({
  id: "/recommendations/id",
  path: "/recommendations/id",
  getParentRoute: () => DashboardRouteRoute
});
const LibraryArtistsIdAlbumsAlbumIdRoute = Route.update({
  id: "/albums/albumId",
  path: "/albums/albumId",
  getParentRoute: () => LibraryArtistsIdRoute
});
const ApiRecommendationsServerRoute = ServerRoute$9.update({
  id: "/api/recommendations",
  path: "/api/recommendations",
  getParentRoute: () => rootServerRouteImport
});
const ApiPlaylistServerRoute = ServerRoute$8.update({
  id: "/api/playlist",
  path: "/api/playlist",
  getParentRoute: () => rootServerRouteImport
});
const ApiConfigServerRoute = ServerRoute$7.update({
  id: "/api/config",
  path: "/api/config",
  getParentRoute: () => rootServerRouteImport
});
const ApiLidarrAddServerRoute = ServerRoute$6.update({
  id: "/api/lidarr/add",
  path: "/api/lidarr/add",
  getParentRoute: () => rootServerRouteImport
});
const ApiAuthRegisterServerRoute = ServerRoute$5.update({
  id: "/api/auth/register",
  path: "/api/auth/register",
  getParentRoute: () => rootServerRouteImport
});
const ApiAuthLoginServerRoute = ServerRoute$4.update({
  id: "/api/auth/login",
  path: "/api/auth/login",
  getParentRoute: () => rootServerRouteImport
});
const ApiAuthSplatServerRoute = ServerRoute$3.update({
  id: "/api/auth/$",
  path: "/api/auth/$",
  getParentRoute: () => rootServerRouteImport
});
const ApiNavidromeStreamIdServerRoute = ServerRoute$2.update({
  id: "/api/navidrome/stream/$id",
  path: "/api/navidrome/stream/$id",
  getParentRoute: () => rootServerRouteImport
});
const ApiNavidromeChar91DotPathChar93ServerRoute = ServerRoute$1.update({
  id: "/api/navidrome/[./path]",
  path: "/api/navidrome/[./path]",
  getParentRoute: () => rootServerRouteImport
});
const ApiNavidromeStreamIdIdServerRoute = ServerRoute.update({
  id: "/api/navidrome/stream/id/id",
  path: "/api/navidrome/stream/id/id",
  getParentRoute: () => rootServerRouteImport
});
const authRouteRouteChildren = {
  authLoginRoute,
  authSignupRoute
};
const authRouteRouteWithChildren = authRouteRoute._addFileChildren(authRouteRouteChildren);
const DashboardRouteRouteChildren = {
  DashboardIndexRoute,
  DashboardRecommendationsIdRoute
};
const DashboardRouteRouteWithChildren = DashboardRouteRoute._addFileChildren(DashboardRouteRouteChildren);
const LibraryArtistsIdRouteChildren = {
  LibraryArtistsIdAlbumsAlbumIdRoute
};
const LibraryArtistsIdRouteWithChildren = LibraryArtistsIdRoute._addFileChildren(LibraryArtistsIdRouteChildren);
const LibraryArtistsRouteChildren = {
  LibraryArtistsIdRoute: LibraryArtistsIdRouteWithChildren
};
const LibraryArtistsRouteWithChildren = LibraryArtistsRoute._addFileChildren(LibraryArtistsRouteChildren);
const rootRouteChildren = {
  IndexRoute,
  authRouteRoute: authRouteRouteWithChildren,
  DashboardRouteRoute: DashboardRouteRouteWithChildren,
  ConfigRoute,
  LibraryArtistsRoute: LibraryArtistsRouteWithChildren,
  LibrarySearchRoute
};
const routeTree = Route$c._addFileChildren(rootRouteChildren)._addFileTypes();
const rootServerRouteChildren = {
  ApiConfigServerRoute,
  ApiPlaylistServerRoute,
  ApiRecommendationsServerRoute,
  ApiAuthSplatServerRoute,
  ApiAuthLoginServerRoute,
  ApiAuthRegisterServerRoute,
  ApiLidarrAddServerRoute,
  ApiNavidromeChar91DotPathChar93ServerRoute,
  ApiNavidromeStreamIdServerRoute,
  ApiNavidromeStreamIdIdServerRoute
};
const serverRouteTree = rootServerRouteImport._addFileChildren(rootServerRouteChildren)._addFileTypes();
const routeTree_gen = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  routeTree,
  serverRouteTree
}, Symbol.toStringTag, { value: "Module" }));
function createRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 1e3 * 60 * 2
        // 2 minutes
      }
    }
  });
  const router = createRouter$1({
    routeTree,
    context: { queryClient, user: null },
    defaultPreload: "intent",
    // react-query will handle data fetching & caching
    // https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#passing-all-loader-events-to-an-external-cache
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: DefaultNotFound,
    scrollRestoration: true,
    defaultStructuralSharing: true
  });
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    handleRedirects: true,
    wrapQueryClient: true
  });
  return router;
}
const serverEntry$1 = createStartHandler({
  createRouter
})(defaultStreamHandler);
const serverEntry = defineEventHandler(function(event) {
  const request = toWebRequest(event);
  return serverEntry$1({ request });
});

export { AudioPlayer as A, Button as B, Route$8 as R, authQueryOptions as a, useAudioStore as b, cn as c, Route$4 as d, serverEntry as default, Route$3 as e, getAlbums as f, getArtists as g, getSongs as h, env as i, db as j, createServerRpc as k, createServerFn as l, auth as m, getWebRequest as n, search as s, useTheme as u };
//# sourceMappingURL=ssr.mjs.map
