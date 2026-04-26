'use client';

import RegisterForm from '@/src/components/AuthForms/RegisterForm';
import styles from './page.module.css';

export default function RegisterPage() {
  return (
    <div className={styles.pageContainer}>
      <RegisterForm />
    </div>
  );
}