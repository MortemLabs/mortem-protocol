// The db package exports Mortem's Prisma singleton and generated Prisma namespace. Services
// import from here instead of constructing their own clients.
export { Prisma, PrismaClient } from "@prisma/client"
export { default, prisma } from "./client.js"
