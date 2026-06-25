"use client";

import React, { useState } from "react";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export type Notification = {
  id: string;
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  action?: () => void;
};

interface NotificationItemProps {
  notification: Notification;
  index: number;
  onMarkAsRead: (id: string) => void;
}

const NotificationItem = ({ notification, index, onMarkAsRead }: NotificationItemProps) => (
  <motion.div
    initial={{ opacity: 0, x: 12, filter: "blur(6px)" }}
    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
    transition={{ duration: 0.25, delay: index * 0.07 }}
    className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
    onClick={() => { onMarkAsRead(notification.id); notification.action?.() }}
  >
    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
      {!notification.read && (
        <span className="h-2 w-2 rounded-full bg-[#1B54FF]" />
      )}
      {notification.read && (
        <span className="h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn("text-sm font-medium leading-tight truncate", notification.read ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100")}>
          {notification.title}
        </p>
        <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
          {notification.timestamp.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </span>
      </div>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-400 dark:text-slate-500 line-clamp-2">
        {notification.description}
      </p>
    </div>
  </motion.div>
);

interface NotificationPopoverProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  className?: string;
}

export function NotificationPopover({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  className,
}: NotificationPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(o => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#1B54FF] text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-50 mt-2 w-80 max-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-[#1B54FF]" />
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-[#1B54FF]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#1B54FF]">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={onMarkAllAsRead}
                      className="rounded-lg px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    >
                      Tout lire
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Liste */}
              <div className="overflow-y-auto max-h-[340px] divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Bell size={22} className="mb-2 text-slate-200 dark:text-slate-700" />
                    <p className="text-xs text-slate-400">Aucune notification</p>
                  </div>
                ) : (
                  notifications.map((n, i) => (
                    <NotificationItem key={n.id} notification={n} index={i} onMarkAsRead={onMarkAsRead} />
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
