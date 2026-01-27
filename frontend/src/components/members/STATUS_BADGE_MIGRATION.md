# Status Badge Migration - Verification Guide

## Overview

The ambiguous `MemberStatusBadge` component has been split into two explicit components to prevent regression of the derived membership status bug:

1. **MembershipStateBadge** - Shows derived membership state (ACTIVE/EXPIRED/EXPIRING SOON)
2. **MemberWorkflowStatusBadge** - Shows persisted workflow status (PAUSED/ARCHIVED/INACTIVE/ACTIVE)

## Components

### MembershipStateBadge
- **Location**: `frontend/src/components/members/MembershipStateBadge.tsx`
- **Props**: `member: Pick<Member, "membershipState" | "isExpiringSoon">`
- **Purpose**: Display actual membership validity based on dates
- **States**:
  - `EXPIRED`: "Süresi Dolmuş" (red)
  - `ACTIVE` + `isExpiringSoon=false`: "Aktif" (green)
  - `ACTIVE` + `isExpiringSoon=true`: "Aktif (Yakında Bitecek)" (yellow)

### MemberWorkflowStatusBadge
- **Location**: `frontend/src/components/members/MemberWorkflowStatusBadge.tsx`
- **Props**: `status: MemberStatus`
- **Purpose**: Display persisted workflow status from database
- **States**:
  - `ACTIVE`: "Sistemde Aktif" (blue)
  - `PAUSED`: "Dondurulmuş" (yellow)
  - `INACTIVE`: "Pasif" (gray)
  - `ARCHIVED`: "Arşivlenmiş" (red)

## Usage Locations

### MembershipStateBadge (Membership Validity)
- ✅ `MemberDetailPage.tsx` - Line 233: Shows membership validity in "Üyelik Bilgileri" section
- ✅ `MemberList.tsx` - Line 196: Shows membership validity in table "Durum" column

### MemberWorkflowStatusBadge (Workflow Status)
- ✅ `StatusChangeDialog.tsx` - Line 110: Shows current workflow status in status change dialog

## Manual Verification Steps

### 1. Expired Member Must Never Show "Aktif"
**Test Case**: Member with `membershipState === "EXPIRED"`
- ✅ Navigate to member detail page
- ✅ Check "Üyelik Durumu" field - should show "Süresi Dolmuş" (red badge)
- ✅ Check member list table - "Durum" column should show "Süresi Dolmuş" (red badge)
- ✅ Verify NO "Aktif" badge appears anywhere for expired members

### 2. Expiring Soon Shows Correct Label
**Test Case**: Member with `membershipState === "ACTIVE"` and `isExpiringSoon === true`
- ✅ Navigate to member detail page
- ✅ Check "Üyelik Durumu" field - should show "Aktif (Yakında Bitecek)" (yellow badge)
- ✅ Check member list table - "Durum" column should show "Aktif (Yakında Bitecek)" (yellow badge)

### 3. Active Member Shows Correct Label
**Test Case**: Member with `membershipState === "ACTIVE"` and `isExpiringSoon === false`
- ✅ Navigate to member detail page
- ✅ Check "Üyelik Durumu" field - should show "Aktif" (green badge)
- ✅ Check member list table - "Durum" column should show "Aktif" (green badge)

### 4. Workflow Status Display
**Test Case**: Member with `status === "PAUSED"` or `status === "ARCHIVED"`
- ✅ Open "Durumu Değiştir" dialog from member detail page
- ✅ Check "Mevcut Durum" field - should show workflow status badge:
  - `PAUSED`: "Dondurulmuş" (yellow)
  - `ARCHIVED`: "Arşivlenmiş" (red)
  - `INACTIVE`: "Pasif" (gray)
  - `ACTIVE`: "Sistemde Aktif" (blue)

### 5. Type Safety
- ✅ Verify TypeScript compilation succeeds
- ✅ Verify no `status?:` optional patterns remain where not needed
- ✅ Verify components cannot be called incorrectly (wrong props)

## Breaking Changes

- ❌ `MemberStatusBadge` component has been **removed**
- ✅ All usages have been migrated to the new components
- ✅ No breaking changes for consumers (all internal usage)

## Notes

- The old ambiguous component accepted both `member` and `status` props, which could lead to displaying persisted `status=ACTIVE` even when membership was EXPIRED
- The new components have explicit, non-overlapping responsibilities
- `MemberWorkflowStatusBadge` uses "Sistemde Aktif" for ACTIVE status to distinguish it from membership validity

