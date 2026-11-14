/* global NexT, CONFIG, Velocity */

document.addEventListener('DOMContentLoaded', () => {

  var isRight = CONFIG.sidebar.position === 'right';
  var desktopLayout = window.matchMedia('(min-width: 992px)');
  var SIDEBAR_DISPLAY_DURATION = 200;
  var mousePos = {};

  var sidebarToggleLines = {
    lines: document.querySelector('.sidebar-toggle'),
    init : function() {
      this.lines.classList.remove('toggle-arrow', 'toggle-close');
    },
    arrow: function() {
      this.lines.classList.remove('toggle-close');
      this.lines.classList.add('toggle-arrow');
    },
    close: function() {
      this.lines.classList.remove('toggle-arrow');
      this.lines.classList.add('toggle-close');
    }
  };

  var sidebarToggleMotion = {
    sidebarEl       : document.querySelector('.sidebar'),
    isSidebarVisible: false,
    init            : function() {
      sidebarToggleLines.init();

      window.addEventListener('mousedown', this.mousedownHandler.bind(this));
      window.addEventListener('mouseup', this.mouseupHandler.bind(this));
      document.querySelector('#sidebar-dimmer').addEventListener('click', () => this.hideSidebar());
      document.querySelector('.sidebar-toggle').addEventListener('click', this.clickHandler.bind(this));
      document.querySelector('.sidebar-toggle').addEventListener('mouseenter', this.mouseEnterHandler.bind(this));
      document.querySelector('.sidebar-toggle').addEventListener('mouseleave', this.mouseLeaveHandler.bind(this));
      window.addEventListener('sidebar:show', this.showSidebar.bind(this));
      window.addEventListener('sidebar:hide', this.hideSidebar.bind(this));
      document.addEventListener('keydown', this.keydownHandler.bind(this));
      this.sidebarEl.addEventListener('click', event => {
        if (!desktopLayout.matches && event.target.closest('a[href]')) this.hideSidebar();
      }, true);
      desktopLayout.addEventListener('change', () => {
        // A desktop padding animation must not survive a change to drawer mode.
        window.anime.remove(document.body);
        document.body.style.paddingLeft = '';
        document.body.style.paddingRight = '';
        this.hideSidebar();
        if (desktopLayout.matches) NexT.utils.updateSidebarPosition();
      });
    },
    mousedownHandler: function(event) {
      mousePos.X = event.pageX;
      mousePos.Y = event.pageY;
    },
    mouseupHandler: function(event) {
      var deltaX = event.pageX - mousePos.X;
      var deltaY = event.pageY - mousePos.Y;
      var clickingBlankPart = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY)) < 20 && event.target.matches('.main');
      if (this.isSidebarVisible && (clickingBlankPart || event.target.matches('img.medium-zoom-image, .fancybox img'))) {
        this.hideSidebar();
      }
    },
    clickHandler: function() {
      this.isSidebarVisible ? this.hideSidebar() : this.showSidebar();
    },
    keydownHandler: function(event) {
      if (!this.isSidebarVisible) return;
      if (event.key === 'Escape') {
        this.hideSidebar();
        document.querySelector('.sidebar-toggle').focus();
      }
      if (event.key !== 'Tab' || desktopLayout.matches) return;
      const toggle = document.querySelector('.sidebar-toggle');
      const controls = [toggle, ...this.sidebarEl.querySelectorAll('a[href], button, [tabindex="0"]')]
        .filter(element => element.getClientRects().length && !element.disabled);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    },
    mouseEnterHandler: function() {
      if (!this.isSidebarVisible) {
        sidebarToggleLines.arrow();
      }
    },
    mouseLeaveHandler: function() {
      if (!this.isSidebarVisible) {
        sidebarToggleLines.init();
      }
    },
    showSidebar: function() {
      if (this.isSidebarVisible || (!desktopLayout.matches && !CONFIG.sidebar.onmobile)) return;
      this.isSidebarVisible = true;
      this.sidebarEl.classList.add('sidebar-active');
      this.sidebarEl.inert = false;
      this.sidebarEl.setAttribute('aria-hidden', 'false');
      document.body.classList.add('sidebar-open');
      document.querySelector('.sidebar-toggle').setAttribute('aria-expanded', 'true');
      document.querySelector('.sidebar-toggle').setAttribute('aria-label', '关闭侧栏');
      if (typeof Velocity === 'function') {
        Velocity(document.querySelectorAll('.sidebar .motion-element'), isRight ? 'transition.slideRightIn' : 'transition.slideLeftIn', {
          stagger: 50,
          drag   : true
        });
      }

      sidebarToggleLines.close();
      const sidebarWidth = this.sidebarEl.getBoundingClientRect().width;
      window.anime.remove(document.body);
      desktopLayout.matches && window.anime(Object.assign({
        targets : document.body,
        duration: SIDEBAR_DISPLAY_DURATION,
        easing  : 'linear'
      }, isRight ? {
        'padding-right': sidebarWidth
      } : {
        'padding-left': sidebarWidth
      }));
    },
    hideSidebar: function() {
      this.isSidebarVisible = false;
      this.sidebarEl.classList.remove('sidebar-active');
      if (this.sidebarEl.contains(document.activeElement)) document.querySelector('.sidebar-toggle').focus();
      this.sidebarEl.inert = true;
      this.sidebarEl.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('sidebar-open');
      document.querySelector('.sidebar-toggle').setAttribute('aria-expanded', 'false');
      document.querySelector('.sidebar-toggle').setAttribute('aria-label', '打开侧栏');

      sidebarToggleLines.init();
      window.anime.remove(document.body);
      desktopLayout.matches && window.anime(Object.assign({
        targets : document.body,
        duration: SIDEBAR_DISPLAY_DURATION,
        easing  : 'linear'
      }, isRight ? {
        'padding-right': 0
      } : {
        'padding-left': 0
      }));
    }
  };
  sidebarToggleMotion.init();

  function updateFooterPosition() {
    var footer = document.querySelector('.footer');
    var containerHeight = document.querySelector('.header').offsetHeight + document.querySelector('.main').offsetHeight + footer.offsetHeight;
    footer.classList.toggle('footer-fixed', containerHeight <= window.innerHeight);
  }

  updateFooterPosition();
  window.addEventListener('resize', updateFooterPosition);
  window.addEventListener('scroll', updateFooterPosition);
});
