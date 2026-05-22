# Wallet Service

Este es un servicio de billetera para un negocio donde los usuarios pueden tener saldo mediante depositos y retiros de saldo. Ademas, el servicio permite realizar transferencias entre usuarios. Naturalmente los usuarios pueden observar su saldo y movimientos historicos.

# Stack tenologico

| Decision | Eleccion | Alternativas descartadas | Razon |
|----------|----------|--------------------------|-------|
| Lenguaje | TypeScript | JavaScript (sin types), Golang, Python | El dominio financiero tiene muchos tipos críticos (amounts, IDs). Por esta razon tanto Javascript y Python sin types los descarte, el tipado ayuda un monton tanto al momento de mantener el codigo y el runtime. Golang fue mi otra alternativa, es muy buen candidato en mi opinion hace que los errores de tipos aparezcan en compile time, no en producción. Sin embargo, hay que ser sinceros, TypeScript se integra mejor con el stack del equipo y quiero demostrar mi capacidad ahi. 
| Framework | NestJS | Express puro | NestJS es el stack del equipo. Como ya mencione, usar el mismo framework demuestra que puedo trabajar en el codebase real, no solo en un proyecto nuevo. La estructura modular de NestJS también facilita separar responsabilidades (guards, interceptors, modules). Express significaria escribir mas codigo boilerplate para cosas que NestJS ya resuelve (injection, routing, validation), y consumiria mas tiempo para la prueba |
| Base de datos | PostgreSQL | MongoDB | Las operaciones de wallet requieren transacciones ACID reales. Una transferencia involucra múltiples escrituras que deben ser atómicas. MongoDB tiene transacciones multi-documento pero son más limitadas y su modelo de datos no tiene ventaja real aquí - el dominio es relacional y es mucho mas sencillo mantenerlo. |
| ORM | Drizzle | Prisma, TypeORM | Drizzle es bastante poderoso para manejo de transacciones y es muy sencillo trabajar con el, permie escribit Typescript pero lo traduce casi a SQL. Ademas, tengo mucho tiempo trabajando con Drizzle. Por eso, y a pesar de que TypeORM tiene integración nativa con NestJS decidi ir por lo que funciona bien para aborda el problema tecnico de proteccion de datos en la DB.|
| Contrato | REST / HTTP + JSON | gRPC, eventos | gRPC tiene ventajas tanto en performance y contratos tipados, pero agrega mas complejidad (tooling, configuración, curva de aprendizaje para el equipo consumidor). REST es más facil de debuggear, más conocido y consumible. Si el servicio necesitara exponer streaming o alta frecuencia de llamadas inter-servicio, gRPC sería la conversación. |
| Versioning | `/v1/` en la URL | Header `Accept-Version` | El versioning en la URL es visible, cacheable, y no requiere que el cliente sepa manejar headers de negociación. Es la convención más adoptada para APIs internas. |
 
---