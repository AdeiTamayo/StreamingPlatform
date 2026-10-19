import { Link } from 'react-router-dom';
import styles from '../pages/Search.module.css';

export interface PersonListPerson {
  id: number;
  name: string;
}

interface PersonListProps {
  people: PersonListPerson[];
}

export default function PersonList({ people }: PersonListProps) {
  if (people.length === 0) return null;
  return (
    <ul className={styles.personList}>
      {people.map((p) => (
        <li key={p.id} className={styles.personListItem}>
          <Link
            className={styles.personListLink}
            to={`/search?person=${p.id}&q=${encodeURIComponent(p.name)}`}
            title={`View all ${p.name} movies and TV shows`}
          >
            {p.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
