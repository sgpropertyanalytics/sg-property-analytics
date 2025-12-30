export function getInitials(user) {
  if (user?.displayName) {
    return user.displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  return user?.email?.charAt(0).toUpperCase() || '?';
}
