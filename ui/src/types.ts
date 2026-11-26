export interface Job {
  id: number;
  label: string;
  done: boolean;
  code: number | null;
}
export interface Target {
  name: string;
  description: string;
}
export interface Container {
  name: string;
  state: string;
  status: string;
  health: string;
}
