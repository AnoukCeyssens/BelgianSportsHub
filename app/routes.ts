import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("athletes", "routes/athletes.tsx"),
  route("athletes/:athleteId", "routes/athlete.tsx"),
  route("teams/:teamId", "routes/team.tsx"),
  route("calendar", "routes/calendar.tsx"),
  route("championship", "routes/championship.tsx"),
  route("games", "routes/games.tsx"),
  route("curate", "routes/curate._index.tsx"),
  route("curate/run/:step", "routes/curate.run.tsx"),
  route("curate/roster-seed", "routes/curate.roster-seed.tsx"),
  route("curate/sources", "routes/curate.sources.tsx"),
  route("curate/merge-queue", "routes/curate.merge-queue.tsx"),
] satisfies RouteConfig;
