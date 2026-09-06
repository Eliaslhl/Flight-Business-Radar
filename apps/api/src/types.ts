import { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type Logger } from "@fbr/shared";
import { type FastifyInstance } from "fastify";

/** Instance Fastify paramétrée avec le logger pino de `@fbr/shared`. */
export type ApiInstance = FastifyInstance<Server, IncomingMessage, ServerResponse, Logger>;
