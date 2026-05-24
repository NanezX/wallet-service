# Wallet Service

Servicio REST para crear una cuenta por usuario, consultar saldo, registrar depositos y retiros, y transferir fondos entre cuentas.

Las decisiones de diseño e invariantes estan documentadas en [docs/DESIGN.md](docs/DESIGN.md). Este README esta enfocado en como usar la API.

## Base URLs

- Demo publica en Render: `https://wallet-service-oj0c.onrender.com/v1`
- Local con Docker Compose: `http://localhost:3000/v1`
- Health check sin autenticacion: `GET /health`

Para llamar al deploy publico necesitas un token JWT firmado con el mismo `JWT_SECRET` del entorno de Render. Ese secret fue enviado por email; no esta en el repo. Solo exportalo en tu shell local antes de generar el token.

## Quickstart local

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia el archivo de entorno:

   ```bash
   cp .env.example .env
   ```

3. Si tienes PostgreSQL local ocupando `5432` o algo usando `3000`, cambia `POSTGRES_HOST_PORT` o `APP_HOST_PORT` en `.env`.

4. Levanta el stack:

   ```bash
   docker compose up --build
   ```

5. Exporta la base URL:

   ```bash
   export BASE_URL=http://localhost:3000/v1
   ```

## Autenticacion

Todos los endpoints excepto `GET /health` requieren:

```http
Authorization: Bearer <jwt>
```

Notas del contrato:

- Este servicio no tiene signup ni login. La identidad del usuario viene del JWT.
- El claim `sub` debe ser un UUID del usuario.
- Dos JWT con distinto `sub` representan dos usuarios distintos.
- Cada usuario puede tener una sola cuenta.

### Generar un JWT de prueba

Hay un script en `scripts/generate-token.ts` que firma un JWT usando el `JWT_SECRET` del entorno. Acepta un `user-id` opcional (UUID v4) como argumento, y `--expires-in` para fijar la expiracion.

Para usarlo contra Render, exporta primero el secret que recibiste por email:

```bash
export BASE_URL=https://wallet-service-oj0c.onrender.com/v1
export JWT_SECRET='<valor compartido por email>'
```

Luego ejecutalo y copia el JWT que imprime en pantalla. Pega ese valor manualmente en una variable local que uses con `curl`, por ejemplo `AUTH_JWT`, `ALICE_JWT` o `BOB_JWT`.

## Convenciones de la API

- Todas las requests con body usan JSON.
- `amount` es un string decimal positivo con hasta 4 decimales (`"10"`, `"10.5"`, `"10.5000"`). `"0"` es invalido.
- Los endpoints de escritura requieren `X-Idempotency-Key` con UUID v4.
  - Primera ejecucion: `201 Created`.
  - Replay con la misma key y mismo payload: `200 OK` con el mismo body.
  - Misma key con payload distinto: `409 Conflict`.
- `GET /accounts/me/transactions` usa `cursor` opaco y `limit` (default `50`, max `100`).

## Endpoints

| Method | Path                          | Auth | Notas                                |
| ------ | ----------------------------- | ---- | ------------------------------------ |
| GET    | `/health`                     | No   | Verifica conectividad con DB         |
| POST   | `/accounts`                   | Si   | Crea la cuenta del usuario autenticado |
| GET    | `/accounts/me`                | Si   | Devuelve la cuenta del usuario       |
| POST   | `/accounts/me/deposits`       | Si   | Requiere `X-Idempotency-Key`         |
| POST   | `/accounts/me/withdrawals`    | Si   | Requiere `X-Idempotency-Key`         |
| POST   | `/transfers`                  | Si   | Requiere `X-Idempotency-Key`         |
| GET    | `/accounts/me/transactions`   | Si   | Historial paginado por cursor        |

## Flujo guiado

Este flujo crea dos usuarios (Alice y Bob), deposita saldo en Alice y transfiere parte a Bob. Funciona local y contra Render.

### 1. Generar dos JWTs distintos

Ejecuta el script `scripts/generate-token.ts` dos veces (una sin argumento genera un UUID nuevo cada vez) y guarda cada JWT en una variable local. Por ejemplo:

```bash
export ALICE_JWT='<pega-aqui-el-jwt-de-alice>'
export BOB_JWT='<pega-aqui-el-jwt-de-bob>'
```

### 2. Health check

```bash
curl "$BASE_URL/health"
```

Respuesta esperada: `{"status":"ok","checks":{"db":"ok"}}`.

### 3. Crear las cuentas de Alice y Bob

```bash
curl -X POST "$BASE_URL/accounts" -H "Authorization: Bearer $ALICE_JWT"
curl -X POST "$BASE_URL/accounts" -H "Authorization: Bearer $BOB_JWT"
```

### 4. Obtener el `accountId` de Bob

```bash
curl "$BASE_URL/accounts/me" -H "Authorization: Bearer $BOB_JWT"
```

Copia el campo `id` y exportalo:

```bash
export BOB_ACCOUNT_ID='<id-de-la-cuenta-de-bob>'
```

### 5. Depositar 100.0000 en Alice

```bash
curl -X POST "$BASE_URL/accounts/me/deposits" \
  -H "Authorization: Bearer $ALICE_JWT" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: <uuid-v4>" \
  -d '{"amount":"100.0000"}'
```

### 6. Transferir 30.0000 de Alice a Bob

```bash
curl -X POST "$BASE_URL/transfers" \
  -H "Authorization: Bearer $ALICE_JWT" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: <uuid-v4>" \
  -d "{\"destination_account_id\":\"$BOB_ACCOUNT_ID\",\"amount\":\"30.0000\"}"
```

Si repites la misma request con la misma `X-Idempotency-Key`, la API responde `200 OK` con el mismo body sin duplicar el efecto.

### 7. Verificar saldos

```bash
curl "$BASE_URL/accounts/me" -H "Authorization: Bearer $ALICE_JWT"
curl "$BASE_URL/accounts/me" -H "Authorization: Bearer $BOB_JWT"
```

Alice queda en `70.0000` y Bob en `30.0000`.

### 8. Ver historial

```bash
curl "$BASE_URL/accounts/me/transactions?limit=10" -H "Authorization: Bearer $ALICE_JWT"
curl "$BASE_URL/accounts/me/transactions?limit=10" -H "Authorization: Bearer $BOB_JWT"
```

Alice tendra al menos un `DEPOSIT` y un `TRANSFER_OUT`. Bob tendra al menos un `TRANSFER_IN`.

Para paginar, vuelve a llamar al mismo endpoint pasando `cursor=<nextCursor>` del response anterior.

## Errores comunes

| HTTP | Code                      | Cuando ocurre                                                              |
| ---- | ------------------------- | -------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`        | Body invalido, cursor invalido, `X-Idempotency-Key` faltante o invalido    |
| 400  | `INVALID_AMOUNT`          | `amount` es cero                                                           |
| 401  | `UNAUTHENTICATED`         | Falta o falla el bearer token                                              |
| 404  | `ACCOUNT_NOT_FOUND`       | La cuenta del usuario o la cuenta destino no existe                        |
| 409  | `ACCOUNT_ALREADY_EXISTS`  | El usuario ya tiene cuenta                                                 |
| 409  | `IDEMPOTENCY_KEY_REUSED`  | La misma idempotency key se uso con otro payload                           |
| 422  | `INSUFFICIENT_FUNDS`      | Saldo insuficiente para retiro o transferencia                             |
| 422  | `SELF_TRANSFER`           | Origen y destino son la misma cuenta                                       |

## Scripts utiles

```bash
npm run build
npm run test
npm run test:unit
npm run test:integration
```
