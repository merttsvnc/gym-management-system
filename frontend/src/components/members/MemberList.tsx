import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MemberStatusBadge } from './MemberStatusBadge';
import { MemberStatus } from '@/types/member';
import type { Member } from '@/types/member';
import type { ApiError } from '@/types/error';

interface MemberListProps {
  members: Member[];
  isLoading: boolean;
  error: ApiError | null;
  search: string;
  onSearchChange: (search: string) => void;
  statusFilter: MemberStatus | 'ALL';
  onStatusFilterChange: (status: MemberStatus | 'ALL') => void;
  membershipTypeFilter: string | 'ALL';
  onMembershipTypeFilterChange: (type: string | 'ALL') => void;
}

/**
 * Hook for debouncing a value
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Component for displaying member list with filters and search
 */
export function MemberList({
  members,
  isLoading,
  error,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  membershipTypeFilter,
  onMembershipTypeFilterChange,
}: MemberListProps) {
  const [localSearch, setLocalSearch] = useState(search);
  const debouncedSearch = useDebounce(localSearch, 300);

  // Update parent when debounced search changes
  useEffect(() => {
    onSearchChange(debouncedSearch);
  }, [debouncedSearch, onSearchChange]);

  // Sync local search with prop
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('tr-TR');
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error.message || 'Üyeler yüklenirken bir hata oluştu'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Ara... (Ad, Soyad, Telefon)"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              onStatusFilterChange(value as MemberStatus | 'ALL')
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm Durumlar</SelectItem>
              <SelectItem value={MemberStatus.ACTIVE}>Aktif</SelectItem>
              <SelectItem value={MemberStatus.PAUSED}>Dondurulmuş</SelectItem>
              <SelectItem value={MemberStatus.INACTIVE}>Pasif</SelectItem>
              <SelectItem value={MemberStatus.ARCHIVED}>Arşivlenmiş</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={membershipTypeFilter}
            onValueChange={(value) =>
              onMembershipTypeFilterChange(value as string | 'ALL')
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Üyelik Tipi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm Tipler</SelectItem>
              <SelectItem value="Basic">Basic</SelectItem>
              <SelectItem value="Standard">Standard</SelectItem>
              <SelectItem value="Premium">Premium</SelectItem>
              <SelectItem value="Custom">Özel</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-12 flex-1" />
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-12 w-32" />
            </div>
          ))}
        </div>
      ) : members.length === 0 ? (
        <Alert>
          <AlertDescription>Üye bulunamadı</AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Üyelik Tipi</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Kalan Gün</TableHead>
                <TableHead>Başlangıç/Bitiş</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.firstName} {member.lastName}
                  </TableCell>
                  <TableCell>{member.phone}</TableCell>
                  <TableCell>{member.membershipType}</TableCell>
                  <TableCell>
                    <MemberStatusBadge status={member.status} />
                  </TableCell>
                  <TableCell>
                    {member.remainingDays >= 0 ? (
                      <span className="text-green-600 dark:text-green-400">
                        {member.remainingDays} gün
                      </span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400">
                        Süresi dolmuş
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div>{formatDate(member.membershipStartAt)}</div>
                    <div>{formatDate(member.membershipEndAt)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/members/${member.id}`}>Detay</Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/members/${member.id}/edit`}>Düzenle</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

