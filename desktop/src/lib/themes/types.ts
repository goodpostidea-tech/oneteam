export interface Theme {
  id: string;
  name: string;
  description: string;
  styles: Record<string, string>;
}

export interface ThemeGroup {
  label: string;
  themes: Theme[];
}
