import React, { useEffect, useState } from 'react';
import { SearchableSelect } from '../ui/SearchableSelect';
import { projectService } from '../../services/projectService';
import type { Project } from '../../types/project';

export function ProjectSelect({
  value,
  onChange,
  allowAll = false,
}: {
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      projectService
        .list({ search, limit: 50 })
        .then((p) => {
          if (active) {
            setItems(p.items);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  useEffect(() => {
    let active = true;
    if (value)
      projectService
        .getById(value)
        .then((p) => {
          if (active) setSelected(p);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    else setSelected(null);
    return () => {
      active = false;
    };
  }, [value]);
  const options = [
    ...(allowAll ? [{ value: '', label: 'Tất cả dự án' }] : []),
    ...(selected && !items.some((p) => p.id === selected.id) ? [selected] : [])
      .concat(items)
      .map((p) => ({ value: p.id, label: p.code + ' · ' + p.name })),
  ];
  return (
    <div>
      <SearchableSelect
        value={value}
        onChange={onChange}
        onSearchChange={setSearch}
        options={options}
        placeholder="Tìm và chọn dự án"
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
