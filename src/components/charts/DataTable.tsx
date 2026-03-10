// Data Table - Displays query results in a table format
import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface DataTableProps {
  data: Record<string, unknown>[];
  columns: { name: string; type: string }[];
  pageSize?: number;
}

export function DataTable({ data, columns, pageSize = 10 }: DataTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const columnTypeByName = new Map(
    columns.map((column) => [column.name, column.type.toUpperCase()]),
  );

  const totalPages = Math.ceil(data.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = data.slice(startIndex, startIndex + pageSize);

  const toggleRowExpansion = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const unwrapValue = (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value;

    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'value' in value
    ) {
      const nestedValue = (value as { value?: unknown }).value;
      if (
        typeof nestedValue === 'string' ||
        typeof nestedValue === 'number' ||
        nestedValue instanceof Date
      ) {
        return nestedValue;
      }
    }

    return value;
  };

  const isCurrencyColumn = (columnName?: string): boolean => {
    if (!columnName) return false;
    return /(spend|cost|budget|revenue|price|amount|cpc|cpm|cpa|roas)/i.test(
      columnName,
    );
  };

  const formatValue = (
    value: unknown,
    type: string,
    columnName?: string,
  ): string => {
    const normalizedValue = unwrapValue(value);
    if (normalizedValue === null || normalizedValue === undefined) return '-';

    if (type === 'DATE' || type === 'TIMESTAMP') {
      const parsedDate =
        normalizedValue instanceof Date
          ? normalizedValue
          : new Date(String(normalizedValue));

      if (!Number.isNaN(parsedDate.getTime())) {
        return type === 'DATE'
          ? parsedDate.toLocaleDateString()
          : parsedDate.toLocaleString();
      }

      return String(normalizedValue);
    }

    if (typeof normalizedValue === 'number') {
      if (isCurrencyColumn(columnName)) {
        return `$${normalizedValue.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      }

      return normalizedValue.toLocaleString();
    }

    if (typeof normalizedValue === 'string' && normalizedValue.length > 100) {
      return normalizedValue.slice(0, 100) + '...';
    }

    if (typeof normalizedValue === 'object') {
      try {
        return JSON.stringify(normalizedValue);
      } catch {
        return String(normalizedValue);
      }
    }

    return String(normalizedValue);
  };

  const visibleColumns = columns
    .filter(
      (col) =>
        (!col.name.endsWith('_encrypted') && !col.name.includes('_id')) ||
        col.name === 'campaign_id',
    )
    .slice(0, 6);

  if (data.length === 0) {
    return (
      <div className='text-center py-8 text-muted-foreground'>
        No data available
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between text-sm text-muted-foreground'>
        <span>
          Showing {startIndex + 1} to{' '}
          {Math.min(startIndex + pageSize, data.length)} of {data.length}{' '}
          results
        </span>
      </div>

      <div className='border rounded-md overflow-hidden'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/50'>
              <TableHead className='w-10'></TableHead>
              {visibleColumns.map((column) => (
                <TableHead
                  key={column.name}
                  className='font-medium text-xs uppercase tracking-wider'
                >
                  {column.name.replace(/_/g, ' ')}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((row, rowIndex) => {
              const globalIndex = startIndex + rowIndex;
              const isExpanded = expandedRows.has(globalIndex);

              return (
                <React.Fragment key={globalIndex}>
                  <TableRow className='hover:bg-muted/30'>
                    <TableCell>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-6 w-6'
                        onClick={() => toggleRowExpansion(globalIndex)}
                      >
                        {isExpanded ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </Button>
                    </TableCell>
                    {visibleColumns.map((column) => (
                      <TableCell key={column.name} className='text-sm'>
                        {formatValue(
                          row[column.name],
                          column.type,
                          column.name,
                        )}
                      </TableCell>
                    ))}
                  </TableRow>

                  {isExpanded && (
                    <TableRow className='bg-muted/20'>
                      <TableCell colSpan={visibleColumns.length + 1}>
                        <div className='p-4'>
                          <h4 className='text-sm font-medium mb-2'>
                            All Fields
                          </h4>
                          <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                            {Object.entries(row).map(([key, value]) => (
                              <div key={key} className='text-sm'>
                                <span className='text-muted-foreground'>
                                  {key.replace(/_/g, ' ')}:
                                </span>{' '}
                                <span className='font-medium'>
                                  {formatValue(
                                    value,
                                    columnTypeByName.get(key) ||
                                      (typeof value === 'number'
                                        ? 'NUMERIC'
                                        : 'STRING'),
                                    key,
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-between'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={16} className='mr-1' />
            Previous
          </Button>

          <span className='text-sm text-muted-foreground'>
            Page {currentPage} of {totalPages}
          </span>

          <Button
            variant='outline'
            size='sm'
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight size={16} className='ml-1' />
          </Button>
        </div>
      )}
    </div>
  );
}
