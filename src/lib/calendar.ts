import { google } from 'googleapis';
import { db } from '../db';
import { accounts } from '../db/schema';
import { eq } from 'drizzle-orm';

export class GoogleCalendarService {
  async getCalendarClient(userId: string) {
    console.log('🔑 Getting calendar client for user:', userId);
    
    const userAccount = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .limit(1);

    console.log('🔑 Found', userAccount.length, 'accounts for user');

    if (!userAccount.length) {
      console.error('🔑 No Google account linked for user:', userId);
      throw new Error('No Google account linked');
    }

    const account = userAccount[0];
    
    // Check if tokens exist
    if (!account.accessToken) {
      console.error('🔑 No access token found for user:', userId);
      throw new Error('No access token found. Please sign in again.');
    }

    // Log scope for debugging
    console.log('🔑 Account scope:', account.scope);
    
    // Check if calendar scopes are present
    if (account.scope) {
      const hasCalendarReadScope = account.scope.includes('calendar.readonly');
      const hasCalendarEventsScope = account.scope.includes('calendar.events');
      
      if (!hasCalendarReadScope && !hasCalendarEventsScope) {
        console.error('🔑 Account missing calendar scopes. Current scopes:', account.scope);
        throw new Error('Calendar permissions not granted. Please sign out and sign in again to grant calendar access.');
      }
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BACKEND_URL || 'http://localhost:3002'}/api/auth/callback/google`
    );

    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    // Handle automatic token refresh
    oauth2Client.on('tokens', async (tokens) => {
      console.log('🔑 Refreshed Google tokens for user:', userId);
      if (tokens.access_token) {
        // Update the access token in database
        await db
          .update(accounts)
          .set({ 
            accessToken: tokens.access_token,
            updatedAt: new Date(),
          })
          .where(eq(accounts.userId, userId));
      }
      // Update refresh token if provided
      if (tokens.refresh_token) {
        await db
          .update(accounts)
          .set({ 
            refreshToken: tokens.refresh_token,
            updatedAt: new Date(),
          })
          .where(eq(accounts.userId, userId));
      }
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async listCalendars(userId: string) {
    try {
      const calendar = await this.getCalendarClient(userId);
      
      console.log('📅 Fetching calendar list for user:', userId);
      
      const response = await calendar.calendarList.list();
      const calendars = response.data.items || [];
      
      console.log('📅 Found', calendars.length, 'calendars');
      calendars.forEach((cal: any) => {
        console.log('📅 Calendar:', {
          id: cal.id,
          summary: cal.summary,
          primary: cal.primary,
          accessRole: cal.accessRole,
        });
      });
      
      return calendars;
    } catch (error: any) {
      console.error('📅 Error fetching calendar list:', error);
      throw new Error(`Failed to fetch calendar list: ${error.message}`);
    }
  }

  async getEvents(
    userId: string, 
    timeMin?: string, 
    timeMax?: string,
    calendarId?: string | string[]
  ) {
    try {
      const calendar = await this.getCalendarClient(userId);

      // If no calendarId specified, fetch from all calendars
      let calendarIds: string[];
      if (calendarId) {
        calendarIds = Array.isArray(calendarId) ? calendarId : [calendarId];
      } else {
        // Fetch all calendars and get events from all of them
        const calendars = await this.listCalendars(userId);
        calendarIds = calendars.map((cal: any) => cal.id);
        console.log('📅 Fetching events from all calendars:', calendarIds);
      }

      const allItems: any[] = [];

      // Fetch events from each calendar
      for (const calId of calendarIds) {
        console.log('📅 Fetching events from calendar:', calId);
        
        const queryParams = {
          calendarId: calId,
          timeMin: timeMin || new Date().toISOString(),
          timeMax,
          // Google Calendar defaults to up to 250 events/page; fetch 250 and paginate
          maxResults: 250,
          singleEvents: true,
          orderBy: 'startTime' as const,
        };

        console.log('📅 Google Calendar API query params:', queryParams);

        // Paginate through all pages to avoid missing events within the range
        let pageToken: string | undefined = undefined;
        let pageIndex = 0;
        do {
          const response: any = await calendar.events.list({ ...queryParams, pageToken });
          pageIndex += 1;
          const items = response.data.items ?? [];
          console.log(`📅 Calendar ${calId} - Page ${pageIndex}:`, {
            itemCount: items.length,
            nextPageToken: response.data.nextPageToken,
            accessRole: response.data.accessRole,
          });

          // Add calendar ID to each event for reference
          items.forEach((item: any, index: number) => {
            item.calendarId = calId; // Add calendar ID to event
            console.log(`📅 Event ${allItems.length + index + 1}:`, {
              calendar: calId,
              summary: item.summary,
              start: item.start,
              end: item.end,
              id: item.id,
              status: item.status,
            });
          });

          allItems.push(...items);
          pageToken = response.data.nextPageToken ?? undefined;
        } while (pageToken);
      }

      console.log('📅 Total events collected from Google Calendar:', allItems.length);
      return allItems;
    } catch (error: any) {
      console.error('📅 Google Calendar API error:', error);
      console.error('📅 Error details:', {
        message: error.message,
        code: error.code,
        status: error.status,
        response: error.response?.data,
      });
      
      // Handle specific Google API errors
      if (error.code === 401 || error.status === 401) {
        throw new Error('Google Calendar authentication expired. Please sign out and sign in again.');
      }
      
      if (error.code === 403 || error.status === 403) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        console.error('📅 403 Error details:', errorMessage);
        
        // Check for specific 403 error types
        if (errorMessage?.includes('Calendar API has not been used') || 
            errorMessage?.includes('has not been enabled')) {
          throw new Error('Google Calendar API is not enabled in your Google Cloud Console. Please enable it at https://console.cloud.google.com/apis/library/calendar-json.googleapis.com');
        }
        
        if (errorMessage?.includes('insufficient') || errorMessage?.includes('scope')) {
          throw new Error('Insufficient permissions for Google Calendar. Please sign out and sign in again to grant calendar access.');
        }
        
        throw new Error(`Google Calendar access denied. ${errorMessage || 'Please ensure Calendar API is enabled in Google Cloud Console and you have granted calendar permissions.'}`);
      }
      
      if (error.code === 429 || error.status === 429) {
        throw new Error('Google Calendar API rate limit exceeded. Please try again later.');
      }
      
      // Generic error fallback
      throw new Error(`Failed to fetch calendar events: ${error.message}`);
    }
  }

  async createEvent(userId: string, event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: { email: string }[];
  }) {
    const calendar = await this.getCalendarClient(userId);

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return response.data;
  }

  async updateEvent(userId: string, eventId: string, event: {
    summary?: string;
    description?: string;
    start?: { dateTime: string; timeZone?: string };
    end?: { dateTime: string; timeZone?: string };
    attendees?: { email: string }[];
  }) {
    const calendar = await this.getCalendarClient(userId);

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: event,
    });

    return response.data;
  }

  async deleteEvent(userId: string, eventId: string) {
    const calendar = await this.getCalendarClient(userId);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });

    return { success: true };
  }
}
