import { useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Bell, BellIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Loader
} from "@app/components/v3";
import {
  useDeleteAllNotifications,
  useDeleteNotification,
  useMarkAllNotificationsAsRead,
  useUpdateNotification
} from "@app/hooks/api/notifications/mutations";
import { useGetMyNotifications } from "@app/hooks/api/notifications/queries";
import { isCriticalNotification, TUserNotification } from "@app/hooks/api/notifications/types";

import { Notification } from "./Notification";

const NOTIFICATIONS_PER_PAGE = 20;

export const NotificationDropdown = () => {
  const router = useRouter();
  const [visibleNotificationCount, setVisibleNotificationCount] = useState(NOTIFICATIONS_PER_PAGE);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const clearAllButtonRef = useRef<HTMLButtonElement>(null);

  const { data: notifications, isLoading } = useGetMyNotifications();
  const { mutate: markAllAsRead } = useMarkAllNotificationsAsRead();
  const { mutate: updateNotification } = useUpdateNotification();
  const { mutate: deleteNotification } = useDeleteNotification();
  const { mutate: deleteAllNotifications, isPending: isClearingAll } = useDeleteAllNotifications();

  // Links are stored server-side and may be site-relative or absolute, and may carry a query string. Passing them
  // straight to `to` would resolve them against the current path and swallow the search params, so normalize to a
  // path + search + hash and let the router parse it via `href`.
  const openNotificationLink = (link: string) => {
    const { pathname, search, hash } = new URL(link, window.location.origin);
    router.navigate({ href: `${pathname}${search}${hash}` });
  };

  const handleNotificationOpen = (notification: TUserNotification) => {
    if (!notification.isRead) {
      updateNotification({ notificationId: notification.id, isRead: true });
    }
    if (notification.link) {
      openNotificationLink(notification.link);
    }
  };

  const unreadCount = useMemo(
    () => notifications?.filter((n) => !n.isRead).length || 0,
    [notifications]
  );

  const criticalCount = useMemo(
    () => notifications?.filter((n) => !n.isRead && isCriticalNotification(n.type)).length || 0,
    [notifications]
  );

  const hasCritical = criticalCount > 0;
  const visibleNotifications = notifications?.slice(0, visibleNotificationCount);
  const hasMoreNotifications = notifications && visibleNotificationCount < notifications.length;

  return (
    <>
      <DropdownMenu
        modal={false}
        onOpenChange={(isOpen) => {
          if (isOpen) setVisibleNotificationCount(NOTIFICATIONS_PER_PAGE);
        }}
      >
        <DropdownMenuTrigger asChild>
          <IconButton variant="outline" size="sm" aria-label="알림" className="relative">
            {unreadCount > 0 ? <BellIcon className="text-warning" /> : <Bell />}
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 z-10 size-2 rounded-full bg-warning ring-2 ring-background"
              />
            )}
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          className="flex h-[min(550px,calc(100dvh-5rem))] w-[min(400px,calc(100vw-2rem))] overflow-hidden p-0"
          onInteractOutside={(e) => {
            if (isClearAllOpen) e.preventDefault();
          }}
        >
          <div className="flex w-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">알림</span>
                {hasCritical && (
                  <Badge variant="danger">
                    긴급 {criticalCount > 99 ? "99+" : criticalCount}개
                  </Badge>
                )}
              </div>
              <button
                ref={clearAllButtonRef}
                type="button"
                className="text-xs font-medium text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={(e) => {
                  e.preventDefault();
                  if (unreadCount > 0) markAllAsRead();
                  else setIsClearAllOpen(true);
                }}
                disabled={!notifications?.length || isClearingAll}
              >
                {unreadCount > 0 ? "모두 읽음으로 표시" : "모두 지우기"}
              </button>
            </div>
            <div className="flex h-full w-full overflow-auto">
              {isLoading && (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader className="pointer-events-none" size="sm" />
                </div>
              )}
              {!isLoading && notifications?.length === 0 && (
                <div className="flex h-full w-full flex-col items-center justify-center">
                  <Bell className="size-10 text-muted" />
                  <span className="mt-4 text-sm text-accent">새 알림이 없습니다</span>
                  <span className="text-xs text-muted">
                    새 소식과 확인할 항목을 여기에 표시합니다.
                  </span>
                </div>
              )}
              {!isLoading && notifications && notifications.length > 0 && (
                <div className="flex w-full flex-col">
                  {visibleNotifications?.map((notification) => (
                    <div
                      role="button"
                      tabIndex={0}
                      key={notification.id}
                      onClick={() => handleNotificationOpen(notification)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        handleNotificationOpen(notification);
                      }}
                    >
                      <Notification notification={notification} onDelete={deleteNotification} />
                    </div>
                  ))}
                  {hasMoreNotifications && (
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setVisibleNotificationCount((count) => count + NOTIFICATIONS_PER_PAGE);
                      }}
                    >
                      더 보기
                    </DropdownMenuItem>
                  )}
                </div>
              )}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={isClearAllOpen} onOpenChange={setIsClearAllOpen}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (clearAllButtonRef.current && !clearAllButtonRef.current.disabled) {
              clearAllButtonRef.current.focus();
            } else {
              clearAllButtonRef.current?.closest<HTMLElement>("[role='menu']")?.focus();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>알림을 모두 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>
              계정 알림을 포함해 이 조직에서 읽은 알림이 모두 삭제됩니다. 삭제한 알림은 되돌릴 수
              없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" disabled={isClearingAll}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isClearingAll}
              onClick={(e) => {
                e.preventDefault();
                deleteAllNotifications(undefined, {
                  onSuccess: () => setIsClearAllOpen(false)
                });
              }}
            >
              모두 지우기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
