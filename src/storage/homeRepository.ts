import type { Home } from '../home/home';

export interface HomeRepository {
  /** Every player's house. The island shows them all. */
  list(): Promise<Home[]>;
  /** Saves a house and returns it as the server stored it. */
  save(home: Home): Promise<Home>;
}
