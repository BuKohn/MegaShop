document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const productId = this.dataset.productId;
            const cartItem = this.closest('.cart-item');

            if (!confirm('Удалить товар?')) return;

            try {
                const response = await fetch(`/cart/remove/${productId}`, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (result.success) {
                    const badge = document.getElementById('cart-badge');
                    if (result.cartCount !== undefined) {
                        if (result.cartCount > 0) {
                            if (badge) {
                                badge.textContent = result.cartCount;
                            }
                        } else if (badge) {
                            badge.remove();
                        }
                    }

                    // Удаляем элемент из списка
                    if (cartItem) {
                        cartItem.remove();

                        if (!document.querySelector('.cart-item')) {
                            setTimeout(() => location.reload(), 500);
                        }
                    }
                }
            } catch (error) {
                console.error('Ошибка:', error);
            }
        });
    });
});