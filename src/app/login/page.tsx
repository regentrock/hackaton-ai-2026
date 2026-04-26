'use client';

import LoginForm from '@/src/components/AuthForms/LoginForm';
import styles from './page.module.css';

export default function LoginPage() {
  return (
    <div className={styles.pageContainer}>
      <LoginForm />
    </div>
  );
}