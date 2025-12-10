# Development Setup - Authentication

The backend requires JWT authentication. For development, the backend accepts base64-encoded JSON tokens.

## Quick Setup

### Option 1: Environment Variable (Recommended)

Create a `.env` file in the `frontend` directory:

```env
VITE_DEV_TENANT_ID=your-tenant-id-here
```

The app will automatically generate a dev token on startup.

### Option 2: Manual Token Generation

1. Get a tenant ID from your database:

   ```sql
   SELECT id FROM "Tenant" LIMIT 1;
   ```

2. Open browser console and run:
   ```javascript
   import { generateDevToken } from "./src/lib/auth-dev";
   const token = generateDevToken("your-tenant-id-here");
   localStorage.setItem("jwt_token", token);
   location.reload();
   ```

### Option 3: Prompt on Startup

If no token exists and `VITE_DEV_TENANT_ID` is not set, the app will prompt you for a tenant ID on first load (development mode only).

## Getting a Tenant ID

You can get a tenant ID by:

1. **Querying the database directly:**

   ```sql
   SELECT id, name, slug FROM "Tenant";
   ```

2. **Using Prisma Studio:**

   ```bash
   cd backend
   npx prisma studio
   ```

   Navigate to the Tenant table to see tenant IDs.

3. **Creating a test tenant via script:**
   ```typescript
   // In backend, create a simple script
   const tenant = await prisma.tenant.create({
     data: {
       name: "Dev Tenant",
       slug: "dev-tenant",
       defaultCurrency: "USD",
     },
   });
   console.log("Tenant ID:", tenant.id);
   ```

## Token Format

The dev token is a base64-encoded JSON object:

```json
{
  "userId": "dev-user-1",
  "tenantId": "your-tenant-id",
  "email": "dev@example.com",
  "role": "ADMIN"
}
```

## Troubleshooting

- **401 Unauthorized**: Make sure you have a valid token in localStorage
- **403 Forbidden**: The tenantId in your token doesn't exist in the database
- **Token expired**: Tokens don't expire in dev mode, but you can regenerate if needed
