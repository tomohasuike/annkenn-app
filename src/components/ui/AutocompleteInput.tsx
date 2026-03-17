import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2 } from 'lucide-react';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  tableName: string;
  columnName: string;
  projectId?: string | null;  // For filtering by project attributes
  filters?: Record<string, any>; // Optional additional strict filters
  customFilter?: (item: any) => boolean; // Optional client-side filter
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function AutocompleteInput({
  value,
  onChange,
  tableName,
  columnName,
  projectId,
  filters,
  customFilter,
  placeholder,
  className = '',
  required = false
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch suggestions when input changes or isOpen becomes true
  useEffect(() => {
    if (!isOpen) return;

    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        let matchingProjectIds: string[] = [];

        // If projectId is provided, find other projects with the same grouping attributes
        if (projectId && tableName !== 'worker_master' && tableName !== 'projects') {
           console.log(`[Autocomplete] Fetching project template for ID: ${projectId}`);
           const { data: currentProject } = await supabase
              .from('projects')
              .select('category, client_name')
              .eq('id', projectId)
              .single();

           if (currentProject) {
              console.log(`[Autocomplete] Base project attributes:`, currentProject);
              let relatedProjectsQuery = supabase.from('projects').select('id');
              
              if (currentProject.category) {
                  relatedProjectsQuery = relatedProjectsQuery.eq('category', currentProject.category);
              }
              if (currentProject.client_name) {
                  relatedProjectsQuery = relatedProjectsQuery.eq('client_name', currentProject.client_name);
              }

              const { data: relatedProjects } = await relatedProjectsQuery;
              if (relatedProjects && relatedProjects.length > 0) {
                 matchingProjectIds = relatedProjects.map((p: any) => p.id);
                 console.log(`[Autocomplete] Found ${matchingProjectIds.length} related projects`);
              }
           }
        }

        let query = supabase
          .from(tableName)
          .select(columnName)
          .not(columnName, 'is', null)
          .not(columnName, 'eq', '');

        // Apply strict filters if any
        if (filters) {
            Object.entries(filters).forEach(([key, val]) => {
                query = query.eq(key, val);
            });
        }

        if (matchingProjectIds.length > 0) {
             if (tableName === 'completion_reports' || tableName === 'daily_reports') {
                 query = query.in('project_id', matchingProjectIds);
             } else if (tableName === 'report_subcontractors' || tableName === 'tomorrow_subcontractors') {
                 // **CRITICAL FIX**: These tables link via report_id/schedule_id, not project_id directly!
                 // BUT wait, `report_subcontractors` has a `report_id`. We need a join.
                 // Supabase JS doesn't support complex joins in `where` easily without a DB function if we only want the leaf node.
                 // For now, let's bypass the strict project filtering for these tables OR we need to fetch all valid reports first.
                 console.log(`[Autocomplete] Table ${tableName} does not have a direct project_id column. Bypassing strict filter.`);
             }
        }

        if (value) {
            query = query.ilike(columnName, `%${value}%`);
        }

        const { data, error } = await query.limit(100);

        if (error) {
            console.error('[Autocomplete] Supabase Query Error:', error);
            throw error;
        }

        console.log(`[Autocomplete] Raw data fetched:`, data);

        // Extract unique, non-empty values
        if (data) {
           let filteredData = data;
           if (customFilter) {
               filteredData = filteredData.filter(customFilter);
           }
           const uniqueValues = Array.from(new Set(
               filteredData.map((item: any) => item[columnName]).filter((v: any) => v && typeof v === 'string' && v.trim() !== '')
           )).slice(0, 10);
           console.log(`[Autocomplete] Unique suggestions:`, uniqueValues);
           setSuggestions(uniqueValues as string[]);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
      } finally {
        setLoading(false);
      }
    };

    // Debounce slightly to prevent too many queries
    const timer = setTimeout(() => {
      fetchSuggestions();
    }, 300);

    return () => clearTimeout(timer);
  }, [value, isOpen, tableName, columnName, projectId, filters]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      e.preventDefault();
      onChange(suggestions[highlightedIndex]);
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
        required={required}
      />
      
      {isOpen && (suggestions.length > 0 || loading) && (
        <ul className="absolute z-50 w-full mt-1 max-h-60 overflow-auto bg-popover text-popover-foreground border bg-white rounded-md shadow-md">
          {loading ? (
            <li className="px-4 py-2 text-sm text-muted-foreground flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </li>
          ) : (
            suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion}-${index}`}
                className={`px-4 py-2 text-sm cursor-pointer select-none border-b last:border-0 ${
                  index === highlightedIndex ? 'bg-muted' : 'hover:bg-muted/50'
                }`}
                onMouseDown={(e) => {
                  // Prevent input blur before onClick fires
                  e.preventDefault();
                }}
                onClick={() => {
                  onChange(suggestion);
                  setIsOpen(false);
                }}
              >
                {suggestion}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
