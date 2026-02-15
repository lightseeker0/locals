# Quick Implementation Checklist
## Antigravity AI Commits Summary

---

## ✅ FEATURES TO IMPLEMENT (In Order)

### Phase 1: Member List Enhancements (3 commits)
- [ ] Show all registered users in member list (not just chat participants)
- [ ] Merge chat message senders into member list view
- [ ] Add status categorization by online/idle/dnd/offline/invisible
- [ ] Add status dots with color coding
- [ ] Persist user status to server via custom_status field

**Files to Modify**: 
- src/components/MemberList.tsx
- src/services/api.ts
- src/stores/authStore.ts

---

### Phase 2: Message Deletion (7 commits)
- [ ] Implement message deletion API endpoint call
- [ ] Add optimistic updates (remove message immediately from UI)
- [ ] Implement permission checks (owner or admin only)
- [ ] Add delete button to message action overlay
- [ ] Ensure delete button has red color with icon
- [ ] Add error handling and user feedback
- [ ] Make delete button always visible (not hover-dependent)

**Files to Modify**:
- src/components/ChatArea.tsx
- src/hooks/useChatMessages.ts

**Permission Check Logic**:
```typescript
isMe || (user?.is_admin) || (username === VITE_ADMIN_USERNAME)
```

---

### Phase 3: Message Display & Styling (2 commits)
- [ ] Align all messages to left (no alignment based on ownership)
- [ ] Hide action buttons by default, show only on hover
- [ ] Fix action overlay positioning (top of message)
- [ ] Improve message text contrast
- [ ] Use #F8F2EF color for user's own message avatars

**Files to Modify**:
- src/components/ChatArea.tsx

---

### Phase 4: Theme System (2 commits)
- [ ] Change theme colors to #AA0000 (primary)
- [ ] Change theme colors to #F8F2EF (secondary/accent)
- [ ] Keep only Roundmoled V2 theme
- [ ] Remove Light Mode, Frosted Glass, and Dark Matter themes
- [ ] Update all CSS variables

**Files to Modify**:
- src/index.css
- src/styles/dark-matter.css
- src/styles/roundmoled.css
- src/components/modals/SettingsModal.tsx
- src/stores/themeStore.ts

---

### Phase 5: Layout Restructuring (3 commits)
- [ ] Convert to classic Discord column layout
- [ ] Remove gaps between sidebar/channel-list/chat/member-list
- [ ] Make all components full height (h-full)
- [ ] Set padding to 0 for flush layout
- [ ] Add special handling for Electron titlebar (32-40px top padding)
- [ ] Update component header shrink properties

**Files to Modify**:
- src/App.tsx
- src/components/Sidebar.tsx
- src/components/ChannelList.tsx
- src/styles/dark-matter.css

---

### Phase 6: User Control Panel (1 commit - NEW COMPONENT)
- [ ] Create new UserControlPanel.tsx component
- [ ] Add to Layout.tsx
- [ ] Implement user profile card with avatar/name
- [ ] Add status indicator with color dots
- [ ] Implement status dropdown selector
- [ ] Add quick action buttons:
  - [ ] Admin Panel (conditional)
  - [ ] Notifications
  - [ ] Settings
  - [ ] Logout with confirmation
- [ ] Add status persistence via setUserStatus

**Files to Create/Modify**:
- src/components/UserControlPanel.tsx (NEW)
- src/components/Layout.tsx

**Component Width**: 280px fixed

---

## 📋 KEY CODE PATTERNS

### 1. Status Dot Styling
```tsx
<div className={clsx(
  "w-2 h-2 rounded-full",
  status === 'online' ? 'bg-matrix-green' :
  status === 'idle' ? 'bg-yellow-500' :
  status === 'dnd' ? 'bg-red-500' :
  'bg-gray-500'
)}>
  {status === 'dnd' && <div className="..." />}
  {status === 'idle' && <div className="..." />}
</div>
```

### 2. Message Delete Permission
```tsx
if (isMe || isAdmin) {
  return <DeleteButton {...} />
}
```

### 3. Status Selector Dropdown
```tsx
{isStatusPickerOpen && (
  <>
    <div className="fixed inset-0" onClick={close} />
    <div className="absolute bg-matrix-darker/95 ...">
      {statuses.map(status => (
        <button onClick={() => setUserStatus(status)} />
      ))}
    </div>
  </>
)}
```

### 4. Optimistic Delete
```tsx
const deleteMessage = useCallback(async (messageId: string) => {
  // 1. Remove from UI immediately
  setMessages(prev => prev.filter(m => m.id !== messageId))
  
  // 2. Call API
  try {
    await ApiService.deleteMessage(messageId, userId)
  } catch {
    // 3. Restore if error
    await fetchMessages()
  }
}, [])
```

---

## 🎨 COLOR PALETTE

### Primary Colors (Updated)
- **Theme Accent**: #AA0000 (red)
- **Secondary Accent**: #F8F2EF (light beige)
- **Matrix Green**: #00ff64 (unchanged)
- **Status Indicators**:
  - Online: Matrix Green
  - Idle: #FCD34D (yellow)
  - DND: #EF4444 (red)
  - Offline: #6B7280 (gray)

### Removed Themes
- Light Mode
- Frosted Glass
- Dark Matter (as default)

### Kept Theme
- Roundmoled V2 (default)

---

## 🔄 Hook Modifications

### useChatMessages Hook
```tsx
export const useChatMessages = (roomId: string) => {
  // ... existing code
  
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return
    try {
      await ApiService.deleteMessage(messageId, userId)
      await fetchMessages()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }, [user, userId, fetchMessages])
  
  return { messages, sendMessage, deleteMessage }
}
```

### useAuthStore Modifications
```tsx
setUserStatus: async (status) => {
  const { user } = useAuthStore.getState()
  set({ userStatus: status })
  try {
    await ApiService.updateProfile(user?.id!, {
      custom_status: status
    })
  } catch (err) {
    console.error('Status update failed:', err)
  }
}
```

---

## 📐 Layout Grid Changes

### Before
```css
padding: 12px;
gap: 12px;
```

### After
```css
padding: 0;
gap: 0;

/* Electron-specific */
.electron {
  padding-top: 32px;
}
```

---

## ✨ Visual Enhancements

### Message Bubble
- Own messages: Light beige accent (#F8F2EF) with shadow
- Other messages: Dark background with white text
- Actions: Hidden by default, visible on hover
- Delete button: Always visible in red (#EF4444)

### Member List
- Status-based grouping
- Color-coded status indicators
- Clear BANNED label for banned users
- Hover effects for moderation actions

### User Panel
- 280px width, positioned on right
- Profile card with avatar and status
- Status dropdown with quick selection
- Action buttons for admin, notifications, settings, logout

---

## 🔍 Testing Checklist

- [ ] Message deletion works for message owner
- [ ] Message deletion works for admin
- [ ] Permission denied for non-owners
- [ ] Optimistic update removes message immediately
- [ ] Member list shows all users with status
- [ ] Status changes persist to server
- [ ] User can change their status via panel
- [ ] Theme colors consistent across all components
- [ ] Layout has no gaps between components
- [ ] Electron padding correct for titlebar
- [ ] Delete button always visible and clickable
- [ ] Action overlay positions correctly
- [ ] User panel displays correctly with all features

---

## 📝 Notes

1. All commits build upon each other sequentially
2. Some commits are refinements of previous work (especially message deletion)
3. No new npm packages needed - uses existing dependencies
4. Theme simplification reduces maintenance burden
5. Status system now fully integrated with server
6. Member list provides better user discovery
7. User control panel centralizes user actions
