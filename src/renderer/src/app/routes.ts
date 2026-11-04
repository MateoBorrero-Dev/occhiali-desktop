export type RecipesAndJobsTab = 'recetas' | 'trabajos';

export const OPTICAL_FILES_PATH = '/fichas';
export const RECIPES_AND_JOBS_PATH = OPTICAL_FILES_PATH;

export function recipesAndJobsPath(tab: RecipesAndJobsTab): string {
  void tab;
  return OPTICAL_FILES_PATH;
}
