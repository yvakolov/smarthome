import { Injectable, signal } from '@angular/core';
import type { Project } from './models';
import { ProjectsRepository } from './projects.repository';
export { decodeProjects } from './projects.repository';

const copy = <T>(value: T): T => structuredClone(value);
const errorText = (error: unknown): string => error instanceof Error ? error.message : 'Хранилище проектов недоступно.';

@Injectable({ providedIn: 'root' })
export class ProjectsStore {
  readonly warning = signal('');
  readonly loading = signal(true);
  /** Only committed snapshots are exposed to the project manager. */
  readonly projects = signal<Project[]>([]);
  private readonly repository = new ProjectsRepository();
  private readonly drafts = new Map<string, Project>();
  readonly ready = this.initialize();

  private async initialize(): Promise<void> {
    try {
      try { await this.repository.migrateLegacy(); }
      catch (error) { this.warning.set(errorText(error)); }
      this.projects.set(await this.repository.list());
    } catch (error) { this.warning.set(errorText(error)); }
    finally { this.loading.set(false); }
  }

  async refresh(): Promise<void> {
    await this.ready;
    this.loading.set(true);
    try { this.projects.set(await this.repository.list()); }
    catch (error) { this.warning.set(errorText(error)); }
    finally { this.loading.set(false); }
  }

  create(): Project {
    const sequence = Math.max(0, ...[...this.projects(), ...this.drafts.values()].map(p => p.sequence || 0)) + 1;
    const project: Project = {
      id: crypto.randomUUID(), name: `Дом ${sequence}`, sequence, points: [], contours: [], closed: false,
      draft: { points: [], tool: 'graphical', rect: null }, units: 'mm', updatedAt: new Date().toISOString(),
    };
    this.remember(project);
    return copy(project);
  }

  async get(id: string): Promise<Project | undefined> {
    await this.ready;
    // Opening a saved project always reads its committed snapshot, not stale in-memory edits.
    try {
      const saved = await this.repository.get(id);
      if (saved) { this.updateSaved(saved); return saved; }
    } catch (error) {
      this.warning.set(errorText(error));
      if (this.hasSaved(id)) throw error;
    }
    const draft = this.drafts.get(id);
    return draft ? copy(draft) : undefined;
  }

  hasSaved(id: string): boolean { return this.projects().some(p => p.id === id); }
  remember(project: Project): void { this.drafts.set(project.id, copy(project)); }

  private updateSaved(project: Project): void {
    const all = this.projects();
    this.projects.set(all.some(p => p.id === project.id)
      ? all.map(p => p.id === project.id ? copy(project) : p)
      : [...all, copy(project)]);
  }

  async persist(project: Project): Promise<Project> {
    await this.ready;
    try {
      const saved = await this.repository.save(project);
      this.updateSaved(saved);
      // An in-flight save never overwrites newer editor drafts.
      this.warning.set('');
      return saved;
    } catch (error) { this.warning.set(errorText(error)); throw error; }
  }
}
