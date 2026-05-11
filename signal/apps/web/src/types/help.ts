export interface HelpSection {
  id: string;
  title: string;
  content: string[];
}

export interface HelpResponse {
  sections: HelpSection[];
  lastUpdated: string;
}
