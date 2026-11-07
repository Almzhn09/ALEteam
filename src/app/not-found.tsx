import Link from 'next/link';

export const metadata = { title: 'Страница не найдена' };

export default function NotFound() {
  return (
    <div className="container page empty">
      <p className="badge badge-neutral">Ошибка 404</p>
      <h1>Страница не найдена</h1>
      <p className="lead" style={{ margin: '0 auto var(--space-5)' }}>Возможно, адрес набран с ошибкой или материал больше не опубликован.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link className="btn btn-primary" href="/catalog">Перейти в каталог</Link>
        <Link className="btn btn-secondary" href="/">На главную</Link>
      </div>
    </div>
  );
}
