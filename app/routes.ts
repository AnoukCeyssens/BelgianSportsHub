import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("athletes", "routes/athletes.tsx"),
  route("athletes/:athleteId", "routes/athlete.tsx"),
  route("calendar", "routes/calendar.tsx"),
  route("championship", "routes/championship.tsx"),
  route("games", "routes/games.tsx"),
  route("curation/roster-seed", "routes/curation.roster-seed.tsx"),
] satisfies RouteConfig;
