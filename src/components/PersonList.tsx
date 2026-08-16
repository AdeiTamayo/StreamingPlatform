import { Link } from 'react-router-dom';

export interface PersonListPerson {
  id: number;
  name: string;
}

interface PersonListProps {
  people: PersonListPerson[];
}

export default function PersonList({ people }: PersonListProps) {
  return (
    <>
      {people.map((p, i) => (
        <span key={`${p.id}-${i}`}>
          {i > 0 && ', '}
          <Link
            className="detail-person-link"
            to={`/search?person=${p.id}&q=${encodeURIComponent(p.name)}`}
            title={`View all ${p.name} movies and TV shows`}
          >
            {p.name}
          </Link>
        </span>
      ))}
    </>
  );
}