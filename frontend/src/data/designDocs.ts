export interface DesignDocItem {
  id: string;
  title: string;
  date: string;
  content: string;
}

export const designDocs: DesignDocItem[] = [
  {
    id: "doc-1",
    title: "UI Clone Strategy",
    date: "2026-04-09",
    content: `# UI Clone Strategy

## Goal
Recreate the NBA Fantasy playoff look with strong blue and yellow branding, right information rail, and card-based roster layout.

## Layout
- Top hero banner and primary tabs
- Main content panel and optional right sidebar
- Gray shell with white inner cards

## Visual Tokens
- Brand blue: #1f4ea1
- Highlight yellow: #f4d23c
- Score pink: #e5165a
- Typography: Oswald + Rajdhani

## Interaction
- Active tab highlight
- Captain toggle in lineup page
- Transfer action with free-transfer counter`
  },
  {
    id: "doc-2",
    title: "API Draft",
    date: "2026-04-09",
    content: `# API Draft

## Endpoints
- /auth/login
- /profile
- /lineup
- /points/today
- /transactions/options
- /transactions
- /leagues
- /schedule
- /help/rules

## Principles
- In-memory mock state for MVP
- Response shapes aligned to page blocks
- Easy migration path to DB-backed services`
  },
  {
    id: "doc-3",
    title: "Roadmap",
    date: "2026-04-09",
    content: `# Roadmap

## Short term
- Real NBA data ingestion
- Deadline lock for gameweek changes
- Private league invite flow

## Mid term
- Redis caching for schedules and points
- Weekly trend and rank report cards
- Extra transfer penalty rules

## Engineering debt
- Authentication middleware
- API schema validation and error codes
- End-to-end test coverage`
  }
];
