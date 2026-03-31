export interface XrayOptions {
  repoUrl: string;
  outputPath?: string;
  timeout?: number;
}

export interface ArchitectFindings {
  techStack: string[];
  structure: string;
  dependencies: string;
  patterns: string;
  summary: string;
  raw: string;
}

export interface CriticFindings {
  bugs: string[];
  security: string[];
  codeSmells: string[];
  techDebt: string[];
  antiPatterns: string[];
  summary: string;
  raw: string;
}

export interface XrayReport {
  repoName: string;
  repoUrl: string;
  analyzedAt: Date;
  architect: ArchitectFindings;
  critic: CriticFindings;
}
