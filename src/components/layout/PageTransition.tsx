'use client';

import { motion } from 'framer-motion';
import { MOTION } from '@/constants';

/**
 * Entrance animation for page content.
 *
 * Kept to opacity and a 12px lift. Anything larger reads as the page sliding,
 * which is both slower to settle and more likely to bother someone sensitive
 * to motion. `MotionConfig` at the root turns this off entirely when the OS
 * asks for reduced motion.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: MOTION.offset }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION.duration, ease: MOTION.ease }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered list container. Pair with `StaggerItem`. */
export function StaggerList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.ul
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: MOTION.stagger } },
      }}
    >
      {children}
    </motion.ul>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.li
      className={className}
      variants={{
        hidden: { opacity: 0, y: MOTION.offset },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: MOTION.duration, ease: MOTION.ease },
        },
      }}
    >
      {children}
    </motion.li>
  );
}
