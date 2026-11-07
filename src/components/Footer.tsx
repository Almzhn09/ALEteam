import Link from 'next/link';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <section aria-labelledby="footer-about">
          <h2 id="footer-about">О прототипе</h2>
          <p>Хакатонный прототип команды ALEteam. Не является официальным сайтом государственного архива.</p>
          <p>Материалы с меткой <strong>ДЕМО</strong> вымышлены и не являются архивными источниками.</p>
        </section>
        <section aria-labelledby="footer-nav">
          <h2 id="footer-nav">Разделы</h2>
          <ul>
            <li><Link href="/catalog">Каталог документов</Link></li>
            <li><Link href="/favorites">Избранное</Link></li>
            <li><Link href="/assistant">ИИ-помощник</Link></li>
            <li><Link href="/about">Об архиве и помощь</Link></li>
          </ul>
        </section>
        <section aria-labelledby="footer-source">
          <h2 id="footer-source">Официальный источник</h2>
          <p>Актуальные сведения, контакты и услуги — на исходном сайте:</p>
          <p><a href="http://e-arhiv.vko.gov.kz/ru" rel="noopener noreferrer" target="_blank">e-arhiv.vko.gov.kz<span className="visually-hidden"> (откроется в новой вкладке)</span></a></p>
        </section>
      </div>
    </footer>
  );
}
