export type RecipesAndJobsTab = 'recetas' | 'trabajos';

export const RECIPES_AND_JOBS_PATH = '/recetas-trabajos';

export function recipesAndJobsPath(tab: RecipesAndJobsTab): string {
  return `${RECIPES_AND_JOBS_PATH}?tab=${tab}`;
}
