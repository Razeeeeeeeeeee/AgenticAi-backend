# Cube Backend Server

TypeScript tRPC server for Cube with Google Calendar integration, Better Auth, and Poke API support.

## Features

- **tRPC API**: Type-safe API endpoints with automatic client generation
- **Better Auth**: Authentication system with Google OAuth support
- **Google Calendar Integration**: Full calendar CRUD operations
- **Poke API Integration**: SMS webhook integration
- **PostgreSQL Database**: Drizzle ORM for type-safe database operations
- **SSE Support**: Server-Sent Events for real-time chat responses
- **CORS Configuration**: Properly configured for production and development

## Prerequisites

- Node.js 18+ or Bun
- PostgreSQL database
- Google OAuth credentials (for Google Calendar)
- Poke API key (optional)

## Setup

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
# or
bun install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `BETTER_AUTH_SECRET`: Secret key for authentication (generate with `openssl rand -base64 32`)
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `POKE_API_KEY`: Poke API key (optional)

### 3. Setup Database

Generate and push database schema:

```bash
npm run db:generate
npm run db:push
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3003` by default.

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run type-check` - Type check without emitting files
- `npm run db:generate` - Generate database migrations
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Run database migrations

## API Endpoints

### tRPC Endpoints

- **GET/POST** `/trpc` - tRPC API endpoint
- **GET** `/panel` - tRPC Panel GUI for API testing

### REST Endpoints

- **GET** `/health` - Health check endpoint
- **ALL** `/api/auth/*` - Better Auth endpoints
- **POST** `/api/send-sms` - Poke API SMS proxy
- **GET** `/api/chat/stream` - SSE endpoint for chat
- **POST** `/api/webhook/chat-response` - Webhook for chat responses
- **GET** `/debug/verification` - Debug verification table
- **POST** `/debug/clear-verification` - Clear verification table

## Project Structure

```
cube2/backend/
├── src/
│   ├── db/
│   │   ├── index.ts          # Database connection
│   │   └── schema.ts         # Database schema
│   ├── lib/
│   │   ├── auth.ts           # Better Auth configuration
│   │   ├── auth-providers.ts # OAuth providers config
│   │   ├── calendar.ts       # Google Calendar service
│   │   ├── context.ts        # tRPC context
│   │   └── poke.ts           # Poke API client
│   ├── index.ts              # Express server
│   └── router.ts             # tRPC router
├── drizzle.config.ts         # Drizzle ORM config
├── tsconfig.json             # TypeScript config
└── package.json              # Dependencies
```

## tRPC Procedures

### Auth

- `auth.getSession` - Get current session (public)
- `auth.getUser` - Get current user (protected)

### Calendar

- `calendar.listCalendars` - List all accessible calendars (protected)
- `calendar.getEvents` - List calendar events (protected)
  - Supports fetching from all calendars (default) or specific calendar(s)
  - Optional parameters: `timeMin`, `timeMax`, `calendarId` (string or array)
- `calendar.createEvent` - Create calendar event (protected)
- `calendar.updateEvent` - Update calendar event (protected)
- `calendar.deleteEvent` - Delete calendar event (protected)

### Poke

- `poke.sendMessage` - Send SMS via Poke API (public)
- `poke.health` - Health check for Poke integration (public)

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3003/api/auth/callback/google`
6. Copy Client ID and Client Secret to `.env`

## Database Schema

The database includes tables for:
- **users**: User accounts
- **sessions**: Active sessions
- **accounts**: OAuth account links
- **verifications**: Email/OAuth verifications

## Production Deployment

1. Build the project:
```bash
npm run build
```

2. Set production environment variables:
```bash
NODE_ENV=production
BACKEND_URL=https://your-domain.com
FRONTEND_URL=https://your-frontend.com
```

3. Run migrations:
```bash
npm run db:migrate
```

4. Start the server:
```bash
npm start
```

## Usage Examples

### Listing Calendars

```typescript
// Get all calendars the user has access to
const calendars = await trpc.calendar.listCalendars.query();
// Returns: [{ id: '...', summary: 'My Calendar', primary: true, ... }]
```

### Fetching Calendar Events

```typescript
// Fetch events from ALL calendars (default behavior)
const allEvents = await trpc.calendar.getEvents.query({
  timeMin: new Date().toISOString(),
  timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Next 30 days
});

// Fetch events from a specific calendar
const specificCalendarEvents = await trpc.calendar.getEvents.query({
  calendarId: 'primary', // or specific calendar ID
  timeMin: new Date().toISOString(),
});

// Fetch events from multiple specific calendars
const multiCalendarEvents = await trpc.calendar.getEvents.query({
  calendarId: ['calendar1@group.calendar.google.com', 'calendar2@group.calendar.google.com'],
  timeMin: new Date().toISOString(),
});
```

Each event returned includes a `calendarId` field to identify which calendar it belongs to.

## Development Tips

- Use the tRPC Panel at `/panel` for testing API endpoints
- Check server logs for detailed debugging information
- Use `/debug/verification` to inspect auth verification state
- SSE stream at `/api/chat/stream` supports real-time chat

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Check database user permissions

### Google Calendar 403 Access Denied Error

If you encounter **"Google Calendar access denied. Check your permissions."**, follow these steps:

#### 1. Enable Google Calendar API
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Select your project
- Navigate to **APIs & Services > Library**
- Search for "Google Calendar API"
- Click **Enable** if not already enabled
- Direct link: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com

#### 2. Verify OAuth Scopes in Consent Screen
- Go to **APIs & Services > OAuth consent screen**
- Click **Edit App**
- Scroll to **Scopes for Google APIs**
- Ensure these scopes are added:
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `https://www.googleapis.com/auth/calendar.events`
- Save changes

#### 3. Re-authenticate to Get New Scopes
If you authenticated before calendar scopes were added:
- Sign out from your application
- Sign in again to grant calendar permissions
- The OAuth flow will request calendar access
- Check backend logs for `🔑 Account scope:` to verify scopes

#### 4. Check Backend Logs
The improved error handling will show:
- Scope validation: `🔑 Account scope: ...`
- Specific 403 errors: API not enabled vs. insufficient permissions
- Token refresh events: `🔑 Refreshed Google tokens for user: ...`

### General Google OAuth Issues
- Verify redirect URI matches Google Console configuration
- Ensure Google Calendar API is enabled (see above)
- Check OAuth scopes in `auth-providers.ts`
- Review credentials expiration in Google Console

### CORS Issues
- Add your frontend URL to allowed origins in `index.ts`
- Ensure credentials are enabled in CORS config

## License

MIT
