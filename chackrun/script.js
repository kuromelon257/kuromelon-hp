// チャックルン ゲームサイトのスクリプト
document.addEventListener('DOMContentLoaded', function() {
    // フローティングキャラクターのランダムアニメーション
    const characters = document.querySelectorAll('.floating-characters img');
    characters.forEach(character => {
        // ランダムな浮遊効果を追加
        const randomDelay = Math.random() * 2;
        const randomDuration = 5 + Math.random() * 3;
        character.style.animationDelay = `${randomDelay}s`;
        character.style.animationDuration = `${randomDuration}s`;
    });
    
    // ナビゲーションのスクロール制御
    const navLinks = document.querySelectorAll('.game-nav a, .download-btn');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href') && this.getAttribute('href').startsWith('#')) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                const targetSection = document.querySelector(targetId);
                if (targetSection) {
                    const headerHeight = document.querySelector('.game-header').offsetHeight;
                    const targetPosition = targetSection.offsetTop - headerHeight;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
    
    // ヘッダーのスクロール制御（スクロールで背景色の透明度を変更）
    window.addEventListener('scroll', function() {
        const header = document.querySelector('.game-header');
        if (window.scrollY > 50) {
            header.style.backgroundColor = 'rgba(255, 255, 255, 0.98)';
            header.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.1)';
        } else {
            header.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        }
    });
    
    // キャラクターカードのインタラクティブ効果
    const characterCards = document.querySelectorAll('.character-card');
    
    characterCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            const img = this.querySelector('.character-image img');
            img.style.transform = 'scale(1.05)';
            img.style.transition = 'transform 0.3s ease';
        });
        
        card.addEventListener('mouseleave', function() {
            const img = this.querySelector('.character-image img');
            img.style.transform = 'scale(1)';
        });
    });
    
    // シェアボタンの実装（実際のシェアURLはリリース時に設定）
    const twitterBtn = document.querySelector('.share-btn.twitter');
    const lineBtn = document.querySelector('.share-btn.line');
    const facebookBtn = document.querySelector('.share-btn.facebook');
    
    if (twitterBtn) {
        twitterBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const shareText = 'チャックルン - 1分バトル！！最速で熱くなれる対戦アクションゲーム';
            const shareUrl = 'https://kuromelon257.com/chackrun/';
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
        });
    }
    
    if (lineBtn) {
        lineBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const shareUrl = 'https://kuromelon257.com/chackrun/';
            window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`, '_blank');
        });
    }
    
    if (facebookBtn) {
        facebookBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const shareUrl = 'https://kuromelon257.com/chackrun/';
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
        });
    }
});

// 画像の遅延読み込み
document.addEventListener('DOMContentLoaded', function() {
    const lazyImages = document.querySelectorAll('img[data-src]');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver(function(entries, observer) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.getAttribute('data-src');
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            });
        });
        
        lazyImages.forEach(function(img) {
            imageObserver.observe(img);
        });
    } else {
        // IntersectionObserverがサポートされていない場合のフォールバック
        let lazyLoadThrottleTimeout;
        
        function lazyLoad() {
            if (lazyLoadThrottleTimeout) {
                clearTimeout(lazyLoadThrottleTimeout);
            }
            
            lazyLoadThrottleTimeout = setTimeout(function() {
                const scrollTop = window.pageYOffset;
                
                lazyImages.forEach(function(img) {
                    if (img.offsetTop < (window.innerHeight + scrollTop)) {
                        img.src = img.getAttribute('data-src');
                        img.removeAttribute('data-src');
                    }
                });
                
                if (lazyImages.length === 0) {
                    document.removeEventListener('scroll', lazyLoad);
                    window.removeEventListener('resize', lazyLoad);
                    window.removeEventListener('orientationChange', lazyLoad);
                }
            }, 20);
        }
        
        document.addEventListener('scroll', lazyLoad);
        window.addEventListener('resize', lazyLoad);
        window.addEventListener('orientationChange', lazyLoad);
    }
});
